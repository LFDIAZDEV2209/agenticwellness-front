import { execFileSync } from "node:child_process";

/** Lee exclusivamente credenciales QA 3.20 en memoria; nunca registrar el resultado.
 * @param {string} target
 * @returns {string}
 */
export function readQaPassword(target) {
  if (!["CoppAddresd/QA/3.20/", "CoppAddresd/QA/4.7/", "CoppAddresd/QA/4.8/"].some(prefix => target.startsWith(prefix)))
    throw new Error("Credencial ajena a las fixtures QA autorizadas.");
  const code = [
    "import ctypes, ctypes.wintypes as w, json, sys",
    "class B(ctypes.Structure): pass",
    "B._fields_=[('Flags',w.DWORD),('Type',w.DWORD),('TargetName',w.LPWSTR),('Comment',w.LPWSTR),('LastWritten',w.FILETIME),('CredentialBlobSize',w.DWORD),('CredentialBlob',ctypes.POINTER(ctypes.c_ubyte)),('Persist',w.DWORD),('AttributeCount',w.DWORD),('Attributes',ctypes.c_void_p),('TargetAlias',w.LPWSTR),('UserName',w.LPWSTR)]",
    "p=ctypes.POINTER(B)()",
    "adv=ctypes.WinDLL('Advapi32.dll')",
    "adv.CredReadW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD,ctypes.POINTER(ctypes.POINTER(B))]",
    "adv.CredFree.argtypes=[ctypes.c_void_p]",
    "if not adv.CredReadW(sys.argv[1],1,0,ctypes.byref(p)): raise RuntimeError('Credencial QA no disponible')",
    "try: print(json.dumps({'password':ctypes.string_at(p.contents.CredentialBlob,p.contents.CredentialBlobSize).decode('utf-16-le')}))",
    "finally: adv.CredFree(p)",
  ].join("\n");
  return JSON.parse(execFileSync("python", ["-c", code, target], { encoding: "utf8" })).password;
}
