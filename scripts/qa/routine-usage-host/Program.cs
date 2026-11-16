// Host QA aislado: controlador/handler/guard/store/resolver reales, identidad JWT sintética.
// Solo GET de uso; PostgreSQL fuerza default_transaction_read_only. Nunca sustituye el API compartido.
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using CoppAddresd.Api.Context;
using CoppAddresd.Api.Controllers;
using CoppAddresd.Application.Features.ProgramProgress.Queries.GetRoutineUsage;
using CoppAddresd.Application.Interfaces;
using CoppAddresd.Application.Services;
using CoppAddresd.Application.Services.ProgramProgress;
using CoppAddresd.Domain.Enums;
using CoppAddresd.Infrastructure.Persistence;
using CoppAddresd.Infrastructure.Repositories;
using MediatR;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using NSubstitute;

var settingsPath = Environment.GetEnvironmentVariable("COP_222_SETTINGS") ?? throw new Exception("Falta settings local");
var metadataPath = Environment.GetEnvironmentVariable("COP_222_PRIVATE_CONFIG") ?? throw new Exception("Falta metadata privada");
using var settings = JsonDocument.Parse(await File.ReadAllTextAsync(settingsPath));
var connection = new NpgsqlConnectionStringBuilder(settings.RootElement.GetProperty("ConnectionStrings").GetProperty("DefaultConnection").GetString())
{ Options = "-c default_transaction_read_only=on", IncludeErrorDetail = false };
if (connection.Host is not ("localhost" or "127.0.0.1")) throw new Exception("Solo PostgreSQL local");
var key = new SymmetricSecurityKey(RandomNumberGenerator.GetBytes(32));
string Token(bool permission = true, bool admin = false)
{
    var claims = new List<Claim> { new("sub", Guid.NewGuid().ToString()) };
    if (permission) claims.Add(new("permission", "Wellness.View"));
    if (admin) claims.Add(new("role", "Admin"));
    return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken("qa222-front", "erp", claims,
        expires: DateTime.UtcNow.AddHours(1), signingCredentials: new(key, SecurityAlgorithms.HmacSha256)));
}
var builder = WebApplication.CreateSlimBuilder(); builder.Logging.ClearProviders();
builder.WebHost.UseKestrel().UseUrls("http://127.0.0.1:5196");
builder.Host.UseDefaultServiceProvider(o => { o.ValidateOnBuild = false; o.ValidateScopes = true; });
builder.Services.AddControllers().AddApplicationPart(typeof(RoutineUsageController).Assembly);
builder.Services.AddHttpContextAccessor(); builder.Services.AddScoped<IPatientScopeActor, QaUsageActor>();
builder.Services.AddScoped<ICurrentContext>(s =>
{
    var accessor = s.GetRequiredService<IHttpContextAccessor>(); var current = Substitute.For<ICurrentContext>();
    current.HasPermissionAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(call => Task.FromResult(accessor.HttpContext!.User.HasClaim("permission", call.ArgAt<string>(0))));
    return current;
});
builder.Services.AddScoped(_ => new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString).Options));
builder.Services.AddScoped<IPatientScopeStore, PatientScopeStore>(); builder.Services.AddScoped<IPatientScopeGuard, PatientScopeGuard>();
builder.Services.AddScoped<IProgramRoutineUsageStore, ProgramRoutineUsageStore>();
builder.Services.AddScoped<IEffectiveDayContentStore, EffectiveDayContentStore>(); builder.Services.AddScoped<IEffectiveDayContentResolver, EffectiveDayContentResolver>();
builder.Services.AddMediatR(c => c.RegisterServicesFromAssembly(typeof(GetRoutineUsageQuery).Assembly));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false; o.TokenValidationParameters = new() { ValidateIssuer = true, ValidIssuer = "qa222-front",
        ValidateAudience = true, ValidAudience = "erp", ValidateLifetime = true, ValidateIssuerSigningKey = true,
        IssuerSigningKey = key, RoleClaimType = "role" };
});
builder.Services.AddAuthorization();
await using var app = builder.Build();
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path == "/health") { await ctx.Response.WriteAsync("QA222 READ ONLY"); return; }
    if (ctx.Request.Method != "GET" || !ctx.Request.Path.StartsWithSegments("/api/v1/program/routines")) { ctx.Response.StatusCode = 404; return; }
    await next(ctx);
});
app.UseAuthentication(); app.UseAuthorization(); app.MapControllers(); await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:5196") };
var adminToken = Token(admin: true); var zeroToken = Token(); var deniedToken = Token(permission: false, admin: true);
using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
var ids = await db.ExerciseRoutines.AsNoTracking().Where(r => r.Status == NutritionPlanStatus.Active).Select(r => r.Id).ToArrayAsync();
RoutineUsageDto? positive = null;
foreach (var id in ids)
{
    using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/program/routines/{id}/usage"); req.Headers.Authorization = new("Bearer", adminToken);
    using var response = await http.SendAsync(req); response.EnsureSuccessStatusCode();
    var usage = await response.Content.ReadFromJsonAsync<RoutineUsageDto>();
    if (usage?.PatientCount > 0) { positive = usage; break; }
}
if (positive is null) throw new Exception("No hay rutina con uso positivo; no se fabrican datos");
await File.WriteAllTextAsync(metadataPath, JsonSerializer.Serialize(new { url = "http://127.0.0.1:5196", routineId = positive.RoutineId,
    expected = new { patientCount = positive.PatientCount, enrollmentCount = positive.EnrollmentCount, activeWeekCount = positive.ActiveWeekCount },
    adminToken, zeroToken, deniedToken, backend = "9b901d710e8a575e404c2247370f5a67960867f0", readOnly = true }));
Console.WriteLine("QA222 ready; controller/store/resolver reales; PostgreSQL READ ONLY; JWT sintético");
await app.WaitForShutdownAsync();

sealed class QaUsageActor(IHttpContextAccessor accessor) : IPatientScopeActor
{
    private ClaimsPrincipal User => accessor.HttpContext!.User;
    public Guid? UserId => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;
    public bool IsAdmin => User.IsInRole("Admin");
    public Task<Guid?> ProfessionalIdAsync(CancellationToken ct) { ct.ThrowIfCancellationRequested(); return Task.FromResult<Guid?>(null); }
    public Task<bool> HasPermissionAsync(string permission, CancellationToken ct) { ct.ThrowIfCancellationRequested(); return Task.FromResult(User.HasClaim("permission", permission)); }
}
