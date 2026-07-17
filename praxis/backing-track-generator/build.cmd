@echo off
rem Baut BackingTrackGenerator.exe mit dem in Windows enthaltenen C#-Compiler (.NET Framework 4.x).
rem Keine Installation noetig.
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist bin mkdir bin
"%CSC%" /nologo /target:winexe /codepage:65001 /optimize+ ^
  /out:bin\BackingTrackGenerator.exe ^
  /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll ^
  Program.cs MainForm.cs Controls.cs Generator.cs Theory.cs Styles.cs Midi.cs SongFile.cs
if errorlevel 1 (
  echo BUILD FEHLGESCHLAGEN
  exit /b 1
)
echo OK: bin\BackingTrackGenerator.exe
