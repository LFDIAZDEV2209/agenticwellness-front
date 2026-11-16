using System.Text.Json;
using CoppAddresd.Application.Common;
using CoppAddresd.Application.Features.LegalDocuments;
using CoppAddresd.Application.Features.ProgramProgress.PatientSummary;
using CoppAddresd.Application.Features.ProgramProgress.WeeklySuggestions;
using CoppAddresd.Application.Interfaces;
using CoppAddresd.Application.Services;
using CoppAddresd.Application.Services.ProgramProgress;
using CoppAddresd.Infrastructure.Persistence;
using CoppAddresd.Infrastructure.Repositories;
using CoppAddresd.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;

try
{
    using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(70)); var ct = deadline.Token;
    using var input = JsonDocument.Parse(await File.ReadAllTextAsync(args[0], ct));
    using var fixture = JsonDocument.Parse(await File.ReadAllTextAsync(input.RootElement.GetProperty("fixture").GetString()!, ct));
    var root = fixture.RootElement;
    if (root.GetProperty("owner").GetString() != "codex-back" || root.GetProperty("commit").GetString() != "e0a9c29dfbf551eaa3d51a97173fe72b55a0781b")
        throw new InvalidOperationException("Fixture no autorizada");
    var patient = root.GetProperty("accounts").GetProperty("aiPatient").GetProperty("patientId").GetGuid();
    var enrollment = root.GetProperty("aiScenario").GetProperty("enrollmentId").GetGuid();
    var week = root.GetProperty("aiScenario").GetProperty("weekNumber").GetInt32();
    var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("COP_TEST_DB_CONNECTION"));
    if (connection.Host is not ("127.0.0.1" or "localhost")) throw new InvalidOperationException("Solo DB local");
    connection.Options = "-c default_transaction_read_only=on";
    connection.ApplicationName = "codex-front-411-outage-readonly";
    await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString).Options);
    var actor = new QaActor(db, input.RootElement.GetProperty("userId").GetGuid(),
        input.RootElement.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()!).ToHashSet());
    var scope = new PatientScopeGuard(actor, new PatientScopeStore(db));
    if (await WeeklySuggestionsAccess.EnsureAsync(scope, enrollment, true, ct) != patient) throw new InvalidOperationException("Fuera de alcance");
    var configuration = new ConfigurationBuilder().AddJsonFile(args[2], false).AddJsonFile(args[3], true).Build();
    var services = new ServiceCollection(); services.AddOptions<LegalConsentSettings>();
    await using var provider = services.BuildServiceProvider();
    var consent = new LegalConsentService(db, provider.GetRequiredService<IOptionsMonitor<LegalConsentSettings>>(), TimeProvider.System);
    var summaries = new PatientSummaryStore(db);
    var clinical = new ClinicalContextService(new PatientRepository(db), new ClinicalMeasurementRepository(db), NullLogger<ClinicalContextService>.Instance);
    var safety = new SafetyRulesService(new SafetyRuleRepository(db), NullLogger<SafetyRulesService>.Instance);
    var effective = new EffectiveDayContentStore(db);
    var weekly = new WeeklySuggestionsStore(db, effective, new EffectiveDayContentResolver(effective), summaries,
        clinical, safety, new ProgramRepository(db, configuration, clock: TimeProvider.System), scope, consent, configuration, TimeProvider.System);
    var summaryTrace = new HttpTrace(); var weeklyTrace = new HttpTrace();
    using var summaryHttp = Client(summaryTrace, "summary"); using var weeklyHttp = Client(weeklyTrace, "weekly");
    var summaryClient = new PatientSummaryClient(summaryHttp, Settings("COP_411_SUMMARY_SIM", "http://127.0.0.1:4552"));
    var weeklyClient = new WeeklySuggestionsClient(weeklyHttp, Settings("COP_411_WEEKLY_SIM", "http://127.0.0.1:4553"));
    var summaryHandler = new GeneratePatientSummaryHandler(scope, consent, summaries, summaryClient, TimeProvider.System);
    var weeklyHandler = new GenerateWeeklySuggestionsHandler(scope, consent, weekly, weeklyClient, NullLogger<GenerateWeeklySuggestionsHandler>.Instance);
    var summaryResult = await summaryHandler.Handle(new(patient, "es"), ct);
    var weeklyResult = await weeklyHandler.Handle(new(enrollment, week, "es"), ct);
    if (summaryResult.Status != "unavailable" || summaryResult.Summary is not null || weeklyResult.Status != "unavailable" || weeklyResult.Draft is not null)
        throw new InvalidOperationException("No se degradó al envelope esperado");
    if (summaryTrace.Statuses.Count == 0 || weeklyTrace.Statuses.Count == 0 || summaryTrace.Statuses.Concat(weeklyTrace.Statuses).Any(s => s != 503))
        throw new InvalidOperationException("La llamada no alcanzó ambos proveedores HTTP 503");
    var output = new { source = "Handlers/clientes/guard/stores EF F4 reales; HTTP Postman503; conexión DB READ ONLY; sin controllers/host/jobs", summary = summaryResult.Status,
        weekly = weeklyResult.Status, summaryHttpStatuses = summaryTrace.Statuses, weeklyHttpStatuses = weeklyTrace.Statuses, noApplyCalled = true };
    await File.WriteAllTextAsync(args[1], JsonSerializer.Serialize(output, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }), ct);
    Console.WriteLine("Caída503: ambos handlers unavailable, sin draft ni aplicación.");
}
catch (Exception error)
{
    Console.Error.WriteLine($"QA411 caída falló: {error.GetType().Name}; detalle omitido.");
    Environment.ExitCode = 1;
}

static HttpClient Client(HttpTrace trace, string slug)
{
    var http = new HttpClient(trace); http.DefaultRequestHeaders.Add("X-Mock-Slug", slug);
    http.DefaultRequestHeaders.Add("X-Mock-Response-Code", "503"); return http;
}
static IOptions<AiServiceSettings> Settings(string variable, string fallback)
{
    var url = new Uri(Environment.GetEnvironmentVariable(variable) ?? fallback);
    if (url.Scheme != "http" || url.Host != "127.0.0.1") throw new InvalidOperationException("Solo simulación local");
    return Options.Create(new AiServiceSettings { BaseUrl = url.ToString().TrimEnd('/'), InternalApiKey = "simulation-only-key", TimeoutSeconds = 5 });
}
sealed class HttpTrace() : DelegatingHandler(new HttpClientHandler())
{
    public List<int> Statuses { get; } = [];
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    { var response = await base.SendAsync(request, ct); Statuses.Add((int)response.StatusCode); return response; }
}
sealed class QaActor(AppDbContext db, Guid user, IReadOnlySet<string> permissions) : IPatientScopeActor
{
    public Guid? UserId => user;
    public bool IsAdmin => false;
    public Task<Guid?> ProfessionalIdAsync(CancellationToken ct) => db.Professionals.AsNoTracking()
        .Where(p => p.Employee!.UserId == user).Select(p => (Guid?)p.Id).SingleOrDefaultAsync(ct);
    public Task<bool> HasPermissionAsync(string permission, CancellationToken ct)
    { ct.ThrowIfCancellationRequested(); return Task.FromResult(permissions.Contains(permission)); }
}
