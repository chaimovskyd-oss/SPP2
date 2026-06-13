// Reads a Windows printer's real supported paper sizes from the driver (DeviceCapabilities API),
// via PowerShell P/Invoke. NODE-ONLY, Windows-only; returns [] on any other platform or failure
// (best-effort — the manual size list remains the fallback).

import { spawn } from "node:child_process";

export interface PrinterPaper {
  name: string;
  widthMm: number;
  heightMm: number;
}

// DC_PAPERNAMES=16 (64-WCHAR names), DC_PAPERSIZE=3 (POINT in 0.1mm). Printer name passed via env
// to avoid command injection. Emits a compact JSON array on stdout.
const PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$code = 'using System;using System.Runtime.InteropServices;public class PaperCaps{[DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)]public static extern int DeviceCapabilities(string device,string port,int cap,IntPtr buf,IntPtr dm);}'
Add-Type -TypeDefinition $code | Out-Null
$name=$env:SPP_PRINTER
$count=[PaperCaps]::DeviceCapabilities($name,$null,16,[IntPtr]::Zero,[IntPtr]::Zero)
if($count -le 0){ '[]'; return }
$namesBuf=[Runtime.InteropServices.Marshal]::AllocHGlobal($count*64*2)
[PaperCaps]::DeviceCapabilities($name,$null,16,$namesBuf,[IntPtr]::Zero) | Out-Null
$sizesBuf=[Runtime.InteropServices.Marshal]::AllocHGlobal($count*8)
[PaperCaps]::DeviceCapabilities($name,$null,3,$sizesBuf,[IntPtr]::Zero) | Out-Null
$list=New-Object System.Collections.ArrayList
for($i=0;$i -lt $count;$i++){
  $p=[IntPtr]::Add($namesBuf,$i*64*2)
  $pn=([Runtime.InteropServices.Marshal]::PtrToStringUni($p,64)).Trim([char]0).Trim()
  $x=[Runtime.InteropServices.Marshal]::ReadInt32($sizesBuf,$i*8)
  $y=[Runtime.InteropServices.Marshal]::ReadInt32($sizesBuf,$i*8+4)
  [void]$list.Add([pscustomobject]@{name=$pn;widthMm=[math]::Round($x/10,1);heightMm=[math]::Round($y/10,1)})
}
[Runtime.InteropServices.Marshal]::FreeHGlobal($namesBuf)
[Runtime.InteropServices.Marshal]::FreeHGlobal($sizesBuf)
$list | ConvertTo-Json -Compress
`;

export function getPrinterPapers(printerName: string): Promise<PrinterPaper[]> {
  if (process.platform !== "win32" || !printerName) return Promise.resolve([]);
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    const proc = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
      env: { ...process.env, SPP_PRINTER: printerName }
    });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    const timer = setTimeout(() => { proc.kill(); resolve([]); }, 15000);
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out.trim() || "[]");
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        resolve(arr.filter((p) => p && typeof p.name === "string" && p.widthMm > 0 && p.heightMm > 0));
      } catch {
        resolve([]);
      }
    });
    proc.on("error", () => { clearTimeout(timer); resolve([]); });
  });
}
