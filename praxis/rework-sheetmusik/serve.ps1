# Robust PowerShell HTTP Server with Audiveris OMR & Project Library Integration
# Serves static files on http://localhost:8082 and handles API endpoints for library management and OMR scans.
# This allows running the server on Windows without Node.js dependencies.

$port = 8082
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

# --- Configuration: Adjust Audiveris CLI Path ---
$AudiverisPath = "audiveris" # Default if in system PATH
$CommonPaths = @(
    "C:\Program Files\Audiveris\Audiveris.exe",
    "C:\Program Files\Audiveris\bin\Audiveris.bat",
    "C:\Program Files (x86)\Audiveris\Audiveris.exe",
    "C:\Program Files (x86)\Audiveris\bin\Audiveris.bat",
    "$env:USERPROFILE\AppData\Local\Programs\Audiveris\Audiveris.exe",
    "$env:USERPROFILE\AppData\Local\Programs\Audiveris\bin\Audiveris.bat"
)
foreach ($path in $CommonPaths) {
    if (Test-Path $path) {
        $AudiverisPath = $path
        Write-Host "Found Audiveris CLI at: $AudiverisPath" -ForegroundColor Green
        break
    }
}

# --- Helper: Resolve LilyPond Paths ---
function Get-LilyPond-Command {
    $isWin = [System.IO.Path]::DirectorySeparatorChar -eq '\'
    if (-not $isWin) {
        return @{
            lilypond    = "lilypond"
            python      = "python3"
            musicxml2ly = "musicxml2ly"
        }
    }
    
    $userProfile = $env:USERPROFILE
    $lilypondPaths = [System.Collections.Generic.List[string]]::new()
    
    $progFiles = $env:ProgramFiles
    if ($null -eq $progFiles) { $progFiles = "C:\Program Files" }
    $progFiles86 = ${env:ProgramFiles(x86)}
    if ($null -eq $progFiles86) { $progFiles86 = "C:\Program Files (x86)" }

    $lilypondPaths.Add((Join-Path $progFiles "LilyPond\bin\lilypond.exe"))
    $lilypondPaths.Add((Join-Path $progFiles "LilyPond\usr\bin\lilypond.exe"))
    $lilypondPaths.Add((Join-Path $progFiles86 "LilyPond\bin\lilypond.exe"))
    $lilypondPaths.Add((Join-Path $progFiles86 "LilyPond\usr\bin\lilypond.exe"))
    
    $wingetPackagesDir = Join-Path $userProfile "AppData\Local\Microsoft\WinGet\Packages"
    if (Test-Path $wingetPackagesDir) {
        try {
            $pkgFolders = Get-ChildItem -Path $wingetPackagesDir -Directory -ErrorAction SilentlyContinue
            foreach ($folder in $pkgFolders) {
                if ($folder.Name.ToLower().Contains("lilypond")) {
                    $subDir = $folder.FullName
                    $subFolders = Get-ChildItem -Path $subDir -Directory -ErrorAction SilentlyContinue
                    foreach ($sub in $subFolders) {
                        if ($sub.Name.ToLower().StartsWith("lilypond")) {
                            $binPath = Join-Path $sub.FullName "bin\lilypond.exe"
                            if (Test-Path $binPath) {
                                $lilypondPaths.Add($binPath)
                            }
                        }
                    }
                }
            }
        }
        catch {}
    }
    
    foreach ($lp in $lilypondPaths) {
        if (Test-Path $lp) {
            $binDir = [System.IO.Path]::GetDirectoryName($lp)
            $pyScript = Join-Path $binDir "musicxml2ly.py"
            $pythonExe = Join-Path $binDir "python.exe"
            if ((Test-Path $pyScript) -and (Test-Path $pythonExe)) {
                return @{
                    lilypond    = "`"$lp`""
                    python      = "`"$pythonExe`""
                    musicxml2ly = "`"$pyScript`""
                }
            }
        }
    }
    
    return @{
        lilypond    = "lilypond"
        python      = "python"
        musicxml2ly = "musicxml2ly"
    }
}

# --- Helper: Resolve MuseScore Paths ---
function Get-MuseScore-Command {
    $progFiles = $env:ProgramFiles
    if ($null -eq $progFiles) { $progFiles = "C:\Program Files" }
    $progFiles86 = ${env:ProgramFiles(x86)}
    if ($null -eq $progFiles86) { $progFiles86 = "C:\Program Files (x86)" }

    $mscorePaths = [System.Collections.Generic.List[string]]::new()
    $mscorePaths.Add((Join-Path $progFiles "MuseScore 4\bin\MuseScore4.exe"))
    $mscorePaths.Add((Join-Path $progFiles "MuseScore 3\bin\MuseScore3.exe"))
    $mscorePaths.Add((Join-Path $progFiles86 "MuseScore 3\bin\MuseScore.exe"))
    
    foreach ($p in $mscorePaths) {
        if (Test-Path $p) {
            return "`"$p`""
        }
    }
    return "mscore"
}

# Setup folders
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicDir = Join-Path $scriptDir "public"
$libraryDir = Join-Path $publicDir "library"
$workDir = Join-Path $scriptDir "temp_omr"

if (!(Test-Path $libraryDir)) {
    New-Item -ItemType Directory -Path $libraryDir | Out-Null
}
if (!(Test-Path $workDir)) {
    New-Item -ItemType Directory -Path $workDir | Out-Null
}

# --- Helper: Multipart Form Data Parser ---
function Get-MultipartFileBytes {
    param (
        [byte[]]$BodyBytes,
        [string]$ContentType
    )

    if ($ContentType -match 'boundary=(.+)$') {
        $boundary = $Matches[1].Trim()
    }
    else {
        return $null
    }

    # Find double CRLF (13, 10, 13, 10) separating headers from file body
    $headerEndIndex = -1
    for ($i = 0; $i -lt $BodyBytes.Length - 4; $i++) {
        if ($BodyBytes[$i] -eq 13 -and $BodyBytes[$i + 1] -eq 10 -and $BodyBytes[$i + 2] -eq 13 -and $BodyBytes[$i + 3] -eq 10) {
            $headerEndIndex = $i + 4
            break
        }
    }

    if ($headerEndIndex -eq -1) {
        return $null
    }

    # Find the closing boundary
    $boundaryStr = "--" + $boundary
    $boundaryBytes = [System.Text.Encoding]::ASCII.GetBytes($boundaryStr)

    $contentEndIndex = -1
    for ($i = $headerEndIndex; $i -lt $BodyBytes.Length - $boundaryBytes.Length; $i++) {
        $match = $true
        for ($j = 0; $j -lt $boundaryBytes.Length; $j++) {
            if ($BodyBytes[$i + $j] -ne $boundaryBytes[$j]) {
                $match = $false
                break
            }
        }
        if ($match) {
            $contentEndIndex = $i - 2
            break
        }
    }

    if ($contentEndIndex -eq -1) {
        $contentEndIndex = $BodyBytes.Length
    }

    $contentLength = $contentEndIndex - $headerEndIndex
    if ($contentLength -le 0) {
        return $null
    }

    $fileBytes = New-Object byte[] $contentLength
    [System.Array]::Copy($BodyBytes, $headerEndIndex, $fileBytes, 0, $contentLength)

    $headerBytes = New-Object byte[] $headerEndIndex
    [System.Array]::Copy($BodyBytes, 0, $headerBytes, 0, $headerEndIndex)
    $headerText = [System.Text.Encoding]::UTF8.GetString($headerBytes)
    
    $filename = "uploaded_file"
    if ($headerText -match 'filename="([^"]+)"') {
        $filename = $Matches[1]
    }

    return [PSCustomObject]@{
        Filename = $filename
        Bytes    = $fileBytes
    }
}

# --- Cryptography Helpers ---

function Convert-HexToBytes {
    param([string]$Hex)
    $Hex = $Hex -replace '\s', ''
    if ($Hex.Length % 2 -ne 0) { throw "Invalid hex string length" }
    try {
        $soap = [System.Runtime.Remoting.Metadata.W3cXsd2001.SoapHexBinary]::Parse($Hex)
        return $soap.Value
    }
    catch {
        $bytes = New-Object byte[] ($Hex.Length / 2)
        for ($i = 0; $i -lt $bytes.Length; $i++) {
            $bytes[$i] = [System.Convert]::ToByte($Hex.Substring(($i * 2), 2), 16)
        }
        return $bytes
    }
}

function Convert-BytesToHex {
    param([byte[]]$Bytes)
    return [System.BitConverter]::ToString($Bytes).Replace("-", "").ToLower()
}

function Get-PBKDF2-Hash {
    param (
        [string]$Password,
        [byte[]]$Salt
    )
    try {
        $alg = [System.Security.Cryptography.HashAlgorithmName]::SHA256
        $pbkdf2 = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Password, $Salt, 10000, $alg)
        return $pbkdf2.GetBytes(32)
    }
    catch {
        $pbkdf2 = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Password, $Salt, 10000)
        return $pbkdf2.GetBytes(32)
    }
}

function Encrypt-String {
    param (
        [string]$Plaintext,
        [byte[]]$Key
    )
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $Key
    $aes.GenerateIV()
    $iv = $aes.IV

    $encryptor = $aes.CreateEncryptor()
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($Plaintext)
    $cipherBytes = $encryptor.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
    
    $aes.Dispose()

    return @{
        iv         = Convert-BytesToHex -Bytes $iv
        ciphertext = Convert-BytesToHex -Bytes $cipherBytes
    }
}

function Decrypt-String {
    param (
        [string]$CiphertextHex,
        [string]$IvHex,
        [byte[]]$Key
    )
    $iv = Convert-HexToBytes -Hex $IvHex
    $cipherBytes = Convert-HexToBytes -Hex $CiphertextHex
    
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $Key
    $aes.IV = $iv
    
    $decryptor = $aes.CreateDecryptor()
    $plainBytes = $decryptor.TransformFinalBlock($cipherBytes, 0, $cipherBytes.Length)
    
    $aes.Dispose()
    
    return [System.Text.Encoding]::UTF8.GetString($plainBytes)
}

# --- Users & System Secret Key Configurations ---
$secretFile = Join-Path $scriptDir "system_secret.key"
$global:SystemKey = $null
if (Test-Path $secretFile) {
    try {
        $hex = [System.IO.File]::ReadAllText($secretFile).Trim()
        $global:SystemKey = Convert-HexToBytes -Hex $hex
    }
    catch {
        Write-Host "Error reading system_secret.key, regenerating..." -ForegroundColor Red
    }
}
if ($null -eq $global:SystemKey) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $hex = Convert-BytesToHex -Bytes $bytes
    [System.IO.File]::WriteAllText($secretFile, $hex)
    $global:SystemKey = $bytes
    Write-Host "Generated new system_secret.key" -ForegroundColor Yellow
}

$usersFile = Join-Path $scriptDir "users.json"
function Get-Users {
    $hash = @{}
    if (Test-Path $usersFile) {
        try {
            $json = [System.IO.File]::ReadAllText($usersFile)
            $usersObj = ConvertFrom-Json $json
            if ($null -ne $usersObj) {
                foreach ($prop in $usersObj.PSObject.Properties) {
                    $hash[$prop.Name] = $prop.Value
                }
            }
        }
        catch {
            Write-Host "Error reading users.json: $_" -ForegroundColor Red
        }
    }
    return $hash
}

function Save-Users {
    param ($Users)
    $json = ConvertTo-Json $Users -Depth 10
    [System.IO.File]::WriteAllText($usersFile, $json)
}

# --- Session & Authentication Store ---
$global:sessions = [System.Collections.Generic.Dictionary[string, object]]::new()

function Get-SessionUser {
    param ($Request)
    $authHeader = $Request.Headers.Get("Authorization")
    if ($null -eq $authHeader -or -not ($authHeader -match "Bearer (.+)")) {
        return $null
    }
    $token = $Matches[1].Trim()
    if ($global:sessions.ContainsKey($token)) {
        return $global:sessions[$token]
    }
    return $null
}

# --- Start Server ---
try {
    $listener.Start()
    Write-Host "`n=======================================================" -ForegroundColor Green
    Write-Host "  Rework Sheetmusic PowerShell Server Started!" -ForegroundColor Green
    Write-Host "  URL: http://localhost:$port/" -ForegroundColor Cyan
    Write-Host "  Audiveris Command: $AudiverisPath" -ForegroundColor Cyan
    Write-Host "  Press Ctrl+C in this terminal to stop." -ForegroundColor Yellow
    Write-Host "=======================================================`n" -ForegroundColor Green
}
catch {
    Write-Host "Failed to start HttpListener: $_" -ForegroundColor Red
    exit
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        Write-Host "[$($request.HttpMethod)] $urlPath" -ForegroundColor DarkGray

        # Add CORS Headers
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/auth/register (Register account)
        # --------------------------------------------------
        if ($urlPath -eq "/api/auth/register" -and $request.HttpMethod -eq "POST") {
            try {
                $stream = $request.InputStream
                $reader = New-Object System.IO.StreamReader($stream)
                $jsonStr = $reader.ReadToEnd()
                
                $data = ConvertFrom-Json $jsonStr
                $username = $data.username
                $password = $data.password
                
                if ($null -eq $username -or $null -eq $password -or $username -eq "" -or $password -eq "") {
                    throw "Benutzername und Passwort sind erforderlich."
                }
                
                $safeUsername = ($username -replace '[^a-zA-Z0-9_-]', '').Trim().ToLower()
                if ($safeUsername -eq "") {
                    throw "Ungültiger Benutzername."
                }
                
                $users = Get-Users
                if ($users.ContainsKey($safeUsername)) {
                    throw "Benutzername existiert bereits."
                }
                
                # First user is admin and approved
                $isFirstUser = ($users.Count -eq 0)
                
                $role = "user"
                $status = "pending"
                if ($isFirstUser) {
                    $role = "admin"
                    $status = "approved"
                }
                
                # Hash & Salt
                $saltBytes = New-Object byte[] 16
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
                $rng.GetBytes($saltBytes)
                $saltHex = Convert-BytesToHex -Bytes $saltBytes
                
                $hashBytes = Get-PBKDF2-Hash -Password $password -Salt $saltBytes
                $hashHex = Convert-BytesToHex -Bytes $hashBytes
                
                # FEK Generation
                $fekBytes = New-Object byte[] 32
                $rng.GetBytes($fekBytes)
                $fekHex = Convert-BytesToHex -Bytes $fekBytes
                
                # Encrypt FEK using user password derived key
                $userPassKey = Get-PBKDF2-Hash -Password $password -Salt $saltBytes
                $encryptedFek = Encrypt-String -Plaintext $fekHex -Key $userPassKey
                
                # Encrypt FEK using system key
                $systemEncryptedFek = Encrypt-String -Plaintext $fekHex -Key $global:SystemKey
                
                $userEntry = @{
                    salt               = $saltHex
                    hash               = $hashHex
                    role               = $role
                    status             = $status
                    encryptedFek       = $encryptedFek
                    systemEncryptedFek = $systemEncryptedFek
                }
                
                # Add to users dictionary
                $users[$safeUsername] = $userEntry
                Save-Users -Users $users
                
                $msg = "Konto registriert. Bitte warte auf Freigabe durch den Administrator."
                if ($isFirstUser) {
                    $msg = "Admin-Konto erfolgreich registriert und freigegeben."
                }
                
                $responseObj = @{ success = $true; message = $msg }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                Write-Host "Register exception: $_" -ForegroundColor Red
                $response.StatusCode = 400
                $response.ContentType = "application/json; charset=utf-8"
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/auth/login (Login)
        # --------------------------------------------------
        if ($urlPath -eq "/api/auth/login" -and $request.HttpMethod -eq "POST") {
            try {
                $stream = $request.InputStream
                $reader = New-Object System.IO.StreamReader($stream)
                $jsonStr = $reader.ReadToEnd()
                
                $data = ConvertFrom-Json $jsonStr
                $username = $data.username
                $password = $data.password
                
                if ($null -eq $username -or $null -eq $password) {
                    throw "Benutzername und Passwort sind erforderlich."
                }
                
                $safeUsername = ($username -replace '[^a-zA-Z0-9_-]', '').Trim().ToLower()
                $users = Get-Users
                $user = $users[$safeUsername]
                
                if ($null -eq $user) {
                    throw "Benutzername oder Passwort falsch."
                }
                
                if ($user.status -eq "pending") {
                    $response.StatusCode = 403
                    throw "Konto ausstehend. Bitte warte auf die Freigabe durch den Administrator."
                }
                if ($user.status -eq "delete_pending") {
                    $response.StatusCode = 403
                    throw "Löschungsanfrage ausstehend. Login gesperrt."
                }
                
                # Verify Password Hash
                $saltBytes = Convert-HexToBytes -Hex $user.salt
                $inputHashBytes = Get-PBKDF2-Hash -Password $password -Salt $saltBytes
                $inputHashHex = Convert-BytesToHex -Bytes $inputHashBytes
                
                if ($inputHashHex -ne $user.hash) {
                    throw "Benutzername oder Passwort falsch."
                }
                
                # Decrypt user FEK
                $userPassKey = Get-PBKDF2-Hash -Password $password -Salt $saltBytes
                $fekHex = Decrypt-String -CiphertextHex $user.encryptedFek.ciphertext -IvHex $user.encryptedFek.iv -Key $userPassKey
                $fileKey = Convert-HexToBytes -Hex $fekHex
                
                # Create Token
                $tokenBytes = New-Object byte[] 32
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
                $rng.GetBytes($tokenBytes)
                $token = Convert-BytesToHex -Bytes $tokenBytes
                
                $global:sessions[$token] = @{
                    username = $safeUsername
                    fileKey  = $fileKey
                    role     = $user.role
                }
                
                $responseObj = @{
                    success  = $true
                    token    = $token
                    username = $safeUsername
                    role     = $user.role
                }
                
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                Write-Host "Login exception: $_" -ForegroundColor Red
                if ($response.StatusCode -eq 200) { $response.StatusCode = 400 }
                $response.ContentType = "application/json; charset=utf-8"
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: GET /api/auth/status (Check Session)
        # --------------------------------------------------
        if ($urlPath -eq "/api/auth/status" -and $request.HttpMethod -eq "GET") {
            $user = Get-SessionUser -Request $request
            if ($null -ne $user) {
                $responseObj = @{
                    success  = $true
                    username = $user.username
                    role     = $user.role
                }
            }
            else {
                $responseObj = @{ success = $false }
            }
            $jsonResponse = ConvertTo-Json $responseObj
            $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
            $response.ContentType = "application/json; charset=utf-8"
            $response.StatusCode = 200
            $response.ContentLength64 = $resBytes.Length
            $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/auth/logout (Logout)
        # --------------------------------------------------
        if ($urlPath -eq "/api/auth/logout" -and $request.HttpMethod -eq "POST") {
            $authHeader = $request.Headers.Get("Authorization")
            if ($null -ne $authHeader -and ($authHeader -match "Bearer (.+)")) {
                $token = $Matches[1].Trim()
                $null = $global:sessions.Remove($token)
            }
            $responseObj = @{ success = $true }
            $jsonResponse = ConvertTo-Json $responseObj
            $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
            $response.ContentType = "application/json; charset=utf-8"
            $response.StatusCode = 200
            $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/auth/delete-request (Request Delete)
        # --------------------------------------------------
        if ($urlPath -eq "/api/auth/delete-request" -and $request.HttpMethod -eq "POST") {
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user) {
                    $response.StatusCode = 401
                    throw "Authentifizierung erforderlich."
                }
                
                if ($user.role -eq "admin") {
                    throw "Der Admin-Account kann nicht gelöscht werden."
                }
                
                $users = Get-Users
                $users[$user.username].status = "delete_pending"
                Save-Users -Users $users
                
                # Invalidate active sessions
                $authHeader = $request.Headers.Get("Authorization")
                if ($null -ne $authHeader -and ($authHeader -match "Bearer (.+)")) {
                    $token = $Matches[1].Trim()
                    $null = $global:sessions.Remove($token)
                }
                
                $responseObj = @{ success = $true; message = "Löschungsanfrage eingereicht." }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                Write-Host "Delete-request exception: $_" -ForegroundColor Red
                if ($response.StatusCode -eq 200) { $response.StatusCode = 400 }
                $response.ContentType = "application/json; charset=utf-8"
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: GET /api/admin/users (Admin: List Users)
        # --------------------------------------------------
        if ($urlPath -eq "/api/admin/users" -and $request.HttpMethod -eq "GET") {
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user -or $user.role -ne "admin") {
                    $response.StatusCode = 403
                    throw "Zugriff verweigert."
                }
                
                $users = Get-Users
                $userList = @()
                foreach ($key in $users.Keys) {
                    $userList += @{
                        username = $key
                        role     = $users[$key].role
                        status   = $users[$key].status
                    }
                }
                
                $responseObj = @{ success = $true; users = $userList }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                Write-Host "Admin List Users exception: $_" -ForegroundColor Red
                if ($response.StatusCode -eq 200) { $response.StatusCode = 400 }
                $response.ContentType = "application/json; charset=utf-8"
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/admin/users/approve (Admin: Approve user)
        # --------------------------------------------------
        if ($urlPath -eq "/api/admin/users/approve" -and $request.HttpMethod -eq "POST") {
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user -or $user.role -ne "admin") {
                    $response.StatusCode = 403
                    throw "Zugriff verweigert."
                }
                
                $stream = $request.InputStream
                $reader = New-Object System.IO.StreamReader($stream)
                $jsonStr = $reader.ReadToEnd()
                $data = ConvertFrom-Json $jsonStr
                $targetUsername = $data.username
                
                if ($null -eq $targetUsername) { throw "Benutzername erforderlich." }
                
                $users = Get-Users
                if (-not $users.ContainsKey($targetUsername)) {
                    throw "Benutzer nicht gefunden."
                }
                
                $users[$targetUsername].status = "approved"
                Save-Users -Users $users
                
                $responseObj = @{ success = $true; message = "Konto freigegeben." }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                Write-Host "Admin Approve exception: $_" -ForegroundColor Red
                if ($response.StatusCode -eq 200) { $response.StatusCode = 400 }
                $response.ContentType = "application/json; charset=utf-8"
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/admin/users/reset-password (Admin: Reset password)
        # --------------------------------------------------
        if ($urlPath -eq "/api/admin/users/reset-password" -and $request.HttpMethod -eq "POST") {
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user -or $user.role -ne "admin") {
                    $response.StatusCode = 403
                    throw "Zugriff verweigert."
                }
                
                $stream = $request.InputStream
                $reader = New-Object System.IO.StreamReader($stream)
                $jsonStr = $reader.ReadToEnd()
                $data = ConvertFrom-Json $jsonStr
                $targetUsername = $data.username
                $newPassword = $data.newPassword
                
                if ($null -eq $targetUsername -or $null -eq $newPassword) {
                    throw "Benutzername und neues Passwort sind erforderlich."
                }
                
                $users = Get-Users
                if (-not $users.ContainsKey($targetUsername)) {
                    throw "Benutzer nicht gefunden."
                }
                
                $targetUser = $users[$targetUsername]
                
                # Decrypt FEK with SystemKey
                $fekHex = Decrypt-String -CiphertextHex $targetUser.systemEncryptedFek.ciphertext -IvHex $targetUser.systemEncryptedFek.iv -Key $global:SystemKey
                
                # Re-encrypt user FEK
                $newSaltBytes = New-Object byte[] 16
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
                $rng.GetBytes($newSaltBytes)
                $newSaltHex = Convert-BytesToHex -Bytes $newSaltBytes
                
                $newHashBytes = Get-PBKDF2-Hash -Password $newPassword -Salt $newSaltBytes
                $newHashHex = Convert-BytesToHex -Bytes $newHashBytes
                
                $newPassKey = Get-PBKDF2-Hash -Password $newPassword -Salt $newSaltBytes
                $newEncryptedFek = Encrypt-String -Plaintext $fekHex -Key $newPassKey
                
                $targetUser.salt = $newSaltHex
                $targetUser.hash = $newHashHex
                $targetUser.encryptedFek = $newEncryptedFek
                
                Save-Users -Users $users
                
                # Invalidate active sessions for that user
                $keysToRemove = @()
                foreach ($token in $global:sessions.Keys) {
                    if ($global:sessions[$token].username -eq $targetUsername) {
                        $keysToRemove += $token
                    }
                }
                foreach ($token in $keysToRemove) {
                    $null = $global:sessions.Remove($token)
                }
                
                $responseObj = @{ success = $true; message = "Passwort erfolgreich zurückgesetzt." }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                Write-Host "Admin Reset-Password exception: $_" -ForegroundColor Red
                if ($response.StatusCode -eq 200) { $response.StatusCode = 400 }
                $response.ContentType = "application/json; charset=utf-8"
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: DELETE /api/admin/users/:username (Admin: Delete user)
        # --------------------------------------------------
        if ($urlPath -match '^/api/admin/users/([^/]+)$' -and $request.HttpMethod -eq "DELETE") {
            $targetUsername = $Matches[1]
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user -or $user.role -ne "admin") {
                    $response.StatusCode = 403
                    throw "Zugriff verweigert."
                }
                
                if ($targetUsername -eq $user.username) {
                    throw "Du kannst deinen eigenen Admin-Account nicht löschen."
                }
                
                $users = Get-Users
                if (-not $users.ContainsKey($targetUsername)) {
                    throw "Benutzer nicht gefunden."
                }
                
                $null = $users.Remove($targetUsername)
                Save-Users -Users $users
                
                # Invalidate user sessions
                $keysToRemove = @()
                foreach ($token in $global:sessions.Keys) {
                    if ($global:sessions[$token].username -eq $targetUsername) {
                        $keysToRemove += $token
                    }
                }
                foreach ($token in $keysToRemove) {
                    $null = $global:sessions.Remove($token)
                }
                
                # Delete user directory recursively
                $userLibDir = Join-Path $libraryDir $targetUsername
                if (Test-Path $userLibDir) {
                    Remove-Item $userLibDir -Recurse -Force -ErrorAction SilentlyContinue
                }
                
                $responseObj = @{ success = $true; message = "Konto und alle zugehörigen Notendateien dauerhaft gelöscht." }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                Write-Host "Admin Delete User exception: $_" -ForegroundColor Red
                if ($response.StatusCode -eq 200) { $response.StatusCode = 400 }
                $response.ContentType = "application/json; charset=utf-8"
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: API File Upload & Audiveris OMR Scan (SECURE)
        # --------------------------------------------------
        if ($urlPath -eq "/api/upload" -and $request.HttpMethod -eq "POST") {
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user) {
                    $response.StatusCode = 401
                    throw "Authentifizierung erforderlich."
                }
                
                Write-Host "Starting secure OMR scan request..." -ForegroundColor Yellow
                
                $stream = $request.InputStream
                $reader = New-Object System.IO.BinaryReader($stream)
                $bodyBytes = $reader.ReadBytes($request.ContentLength64)
                
                $parsedData = Get-MultipartFileBytes -BodyBytes $bodyBytes -ContentType $request.ContentType
                if ($null -eq $parsedData -or $parsedData.Bytes.Length -eq 0) {
                    throw "Invalid file upload or empty file."
                }
                
                $fileName = $parsedData.Filename
                $fileBytes = $parsedData.Bytes
                
                $safeBaseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName) -replace '[^a-zA-Z0-9_.-]', '_'
                $safeExt = [System.IO.Path]::GetExtension($fileName)
                $tempInputPath = Join-Path $workDir "$($safeBaseName)_$([DateTime]::Now.Ticks)$safeExt"
                
                [System.IO.File]::WriteAllBytes($tempInputPath, $fileBytes)
                
                $tempOutputDir = Join-Path $workDir "out_$safeBaseName"
                if (Test-Path $tempOutputDir) {
                    Remove-Item -Path $tempOutputDir -Recurse -Force | Out-Null
                }
                New-Item -ItemType Directory -Path $tempOutputDir | Out-Null
                
                Write-Host "Running Audiveris CLI: $AudiverisPath -batch -export -output $tempOutputDir $tempInputPath" -ForegroundColor DarkCyan
                
                $procStartInfo = New-Object System.Diagnostics.ProcessStartInfo
                $procStartInfo.FileName = $AudiverisPath
                $procStartInfo.Arguments = "-batch -export -output `"$tempOutputDir`" `"$tempInputPath`""
                $procStartInfo.UseShellExecute = $false
                $procStartInfo.RedirectStandardOutput = $true
                $procStartInfo.RedirectStandardError = $true
                $procStartInfo.CreateNoWindow = $true
                
                $process = New-Object System.Diagnostics.Process
                $process.StartInfo = $procStartInfo
                $process.Start() | Out-Null
                $stdout = $process.StandardOutput.ReadToEnd()
                $stderr = $process.StandardError.ReadToEnd()
                $process.WaitForExit()
                
                try { Remove-Item $tempInputPath -Force -ErrorAction SilentlyContinue } catch {}
                
                $outputFile = Get-ChildItem -Path $tempOutputDir -Recurse -Include *.mxl, *.xml | Select-Object -First 1
                
                if ($null -eq $outputFile) {
                    throw "OMR conversion did not yield any MusicXML (.xml or .mxl) output."
                }
                
                $xmlText = ""
                if ($outputFile.Extension.ToLower() -eq ".mxl") {
                    $zipExtractDir = Join-Path $tempOutputDir "extracted"
                    $tempZipPath = Join-Path $tempOutputDir "temp_archive.zip"
                    Copy-Item -Path $outputFile.FullName -Destination $tempZipPath -Force
                    Expand-Archive -Path $tempZipPath -DestinationPath $zipExtractDir -Force
                    Remove-Item $tempZipPath -Force -ErrorAction SilentlyContinue
                    $xmlFile = Get-ChildItem -Path $zipExtractDir -Recurse -Filter *.xml | Select-Object -First 1
                    if ($null -eq $xmlFile) {
                        throw "Failed to extract MusicXML from archive (.mxl)"
                    }
                    $xmlText = [System.IO.File]::ReadAllText($xmlFile.FullName)
                }
                else {
                    $xmlText = [System.IO.File]::ReadAllText($outputFile.FullName)
                }
                
                try { Remove-Item $tempOutputDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
                
                # Save Encrypted XML to User-specific Library
                $userLibDir = Join-Path $libraryDir $user.username
                if (!(Test-Path $userLibDir)) {
                    New-Item -ItemType Directory -Path $userLibDir | Out-Null
                }
                
                $libraryFileName = "$($safeBaseName)_scanned_$([DateTime]::Now.Ticks).musicxml"
                $libraryPath = Join-Path $userLibDir $libraryFileName
                
                $encrypted = Encrypt-String -Plaintext $xmlText -Key $user.fileKey
                $encryptedJson = ConvertTo-Json $encrypted
                [System.IO.File]::WriteAllText($libraryPath, $encryptedJson)
                
                # Write meta companion file
                $title = $safeBaseName
                if ($xmlText -match '<work-title>([^<]+)<\/work-title>' -or $xmlText -match '<movement-title>([^<]+)<\/movement-title>') {
                    $title = $Matches[1].Trim()
                }
                $metaObj = @{ title = $title }
                [System.IO.File]::WriteAllText(($libraryPath + ".meta"), (ConvertTo-Json $metaObj))
                
                $responseObj = @{
                    success  = $true
                    filename = $libraryFileName
                    xml      = $xmlText
                }
                $jsonResponse = ConvertTo-Json $responseObj -Depth 5
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                if ($response.StatusCode -eq 200) { $response.StatusCode = 500 }
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: GET /api/projects (Secure Library List)
        # --------------------------------------------------
        if ($urlPath -eq "/api/projects" -and $request.HttpMethod -eq "GET") {
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user) {
                    $response.StatusCode = 401
                    throw "Authentifizierung erforderlich."
                }
                
                $userLibDir = Join-Path $libraryDir $user.username
                $projectsList = @()
                
                if (Test-Path $userLibDir) {
                    $files = Get-ChildItem -Path $userLibDir -Include *.xml, *.musicxml -Recurse
                    foreach ($f in $files) {
                        $title = $f.Name
                        $metaPath = $f.FullName + ".meta"
                        if (Test-Path $metaPath) {
                            try {
                                $metaJson = Get-Content -Raw -Path $metaPath | ConvertFrom-Json
                                $title = $metaJson.title
                            }
                            catch {}
                        }
                        else {
                            try {
                                $encryptedJson = Get-Content -Raw -Path $f.FullName | ConvertFrom-Json
                                $xmlText = Decrypt-String -CiphertextHex $encryptedJson.ciphertext -IvHex $encryptedJson.iv -Key $user.fileKey
                                
                                if ($xmlText -match '<work-title>([^<]+)<\/work-title>' -or $xmlText -match '<movement-title>([^<]+)<\/movement-title>') {
                                    $title = $Matches[1].Trim()
                                }
                                $metaObj = @{ title = $title }
                                $metaJson = ConvertTo-Json $metaObj
                                [System.IO.File]::WriteAllText($metaPath, $metaJson)
                            }
                            catch {}
                        }
                        
                        $projectsList += @{
                            filename  = $f.Name
                            title     = $title
                            size      = $f.Length
                            createdAt = $f.CreationTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
                        }
                    }
                }
                
                $sorted = $projectsList | Sort-Object @{Expression = { $_.createdAt }; Descending = $true }
                
                $responseObj = @{
                    success  = $true
                    projects = $sorted
                }
                
                $jsonResponse = ConvertTo-Json $responseObj -Depth 5
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                if ($response.StatusCode -eq 200) { $response.StatusCode = 500 }
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: GET /api/projects/:filename (Secure Load file)
        # --------------------------------------------------
        if ($urlPath -match '^/api/projects/([^/]+)$' -and $request.HttpMethod -eq "GET") {
            $filename = $Matches[1]
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user) {
                    $response.StatusCode = 401
                    throw "Authentifizierung erforderlich."
                }
                
                if ($filename -match '\.\.' -or $filename -match '/' -or $filename -match '\\') {
                    throw "Invalid filename traversal check failed."
                }
                
                $userLibDir = Join-Path $libraryDir $user.username
                $filePath = Join-Path $userLibDir $filename
                if (!(Test-Path $filePath)) {
                    $response.StatusCode = 404
                    throw "File not found"
                }
                
                $encryptedJson = Get-Content -Raw -Path $filePath | ConvertFrom-Json
                $xmlText = Decrypt-String -CiphertextHex $encryptedJson.ciphertext -IvHex $encryptedJson.iv -Key $user.fileKey
                
                $responseObj = @{
                    success  = $true
                    filename = $filename
                    xml      = $xmlText
                }
                $jsonResponse = ConvertTo-Json $responseObj -Depth 5
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                if ($response.StatusCode -eq 200) { $response.StatusCode = 500 }
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/projects/save (Secure Save/Overwrite)
        # --------------------------------------------------
        if ($urlPath -eq "/api/projects/save" -and $request.HttpMethod -eq "POST") {
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user) {
                    $response.StatusCode = 401
                    throw "Authentifizierung erforderlich."
                }
                
                $stream = $request.InputStream
                $reader = New-Object System.IO.StreamReader($stream)
                $jsonStr = $reader.ReadToEnd()
                
                $data = ConvertFrom-Json $jsonStr
                $filename = $data.filename
                $xml = $data.xml
                
                if ($filename -match '\.\.' -or $filename -match '/' -or $filename -match '\\') {
                    throw "Invalid filename traversal check failed."
                }
                
                if ($null -eq $filename -or $null -eq $xml) {
                    throw "Filename and xml data required."
                }
                
                if (!($filename.EndsWith(".musicxml") -or $filename.EndsWith(".xml"))) {
                    $filename += ".musicxml"
                }
                
                $userLibDir = Join-Path $libraryDir $user.username
                if (!(Test-Path $userLibDir)) {
                    New-Item -ItemType Directory -Path $userLibDir | Out-Null
                }
                
                $filePath = Join-Path $userLibDir $filename
                
                $encrypted = Encrypt-String -Plaintext $xml -Key $user.fileKey
                $encryptedJson = ConvertTo-Json $encrypted
                [System.IO.File]::WriteAllText($filePath, $encryptedJson)
                
                # Write meta companion file
                $title = [System.IO.Path]::GetFileNameWithoutExtension($filename)
                if ($xml -match '<work-title>([^<]+)<\/work-title>' -or $xml -match '<movement-title>([^<]+)<\/movement-title>') {
                    $title = $Matches[1].Trim()
                }
                $metaObj = @{ title = $title }
                [System.IO.File]::WriteAllText(($filePath + ".meta"), (ConvertTo-Json $metaObj))
                
                $responseObj = @{
                    success  = $true
                    filename = $filename
                }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                if ($response.StatusCode -eq 200) { $response.StatusCode = 500 }
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: DELETE /api/projects/:filename (Secure Delete file)
        # --------------------------------------------------
        if ($urlPath -match '^/api/projects/([^/]+)$' -and $request.HttpMethod -eq "DELETE") {
            $filename = $Matches[1]
            try {
                $user = Get-SessionUser -Request $request
                if ($null -eq $user) {
                    $response.StatusCode = 401
                    throw "Authentifizierung erforderlich."
                }
                
                if ($filename -match '\.\.' -or $filename -match '/' -or $filename -match '\\') {
                    throw "Invalid filename traversal check failed."
                }
                
                $userLibDir = Join-Path $libraryDir $user.username
                $filePath = Join-Path $userLibDir $filename
                if (Test-Path $filePath) {
                    $deleted = $false
                    for ($retry = 0; $retry -lt 5; $retry++) {
                        try {
                            Remove-Item $filePath -Force -ErrorAction Stop
                            $deleted = $true
                            break
                        }
                        catch {
                            Start-Sleep -Milliseconds 200
                        }
                    }
                    if ($deleted) {
                        $metaPath = $filePath + ".meta"
                        if (Test-Path $metaPath) {
                            Remove-Item $metaPath -Force -ErrorAction SilentlyContinue
                        }
                        $responseObj = @{ success = $true }
                    }
                    else {
                        throw "File is locked and cannot be deleted: $_"
                    }
                }
                else {
                    $responseObj = @{ success = $false; error = "File not found" }
                }
                
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                if ($response.StatusCode -eq 200) { $response.StatusCode = 500 }
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: GET /api/engines (Check available engines)
        # --------------------------------------------------
        if ($urlPath -eq "/api/engines" -and $request.HttpMethod -eq "GET") {
            try {
                $lpInfo = Get-LilyPond-Command
                $lpOk = $false
                if ($lpInfo.lilypond) {
                    try {
                        $procStartInfo = New-Object System.Diagnostics.ProcessStartInfo
                        $procStartInfo.FileName = $lpInfo.lilypond.Trim('"')
                        $procStartInfo.Arguments = "--version"
                        $procStartInfo.UseShellExecute = $false
                        $procStartInfo.RedirectStandardOutput = $true
                        $procStartInfo.RedirectStandardError = $true
                        $procStartInfo.CreateNoWindow = $true
                        $process = New-Object System.Diagnostics.Process
                        $process.StartInfo = $procStartInfo
                        $process.Start() | Out-Null
                        $process.WaitForExit(3000)
                        if ($process.ExitCode -eq 0 -or $?) { $lpOk = $true }
                    }
                    catch {}
                }

                $msCmd = Get-MuseScore-Command
                $msOk = $false
                if ($msCmd) {
                    try {
                        $procStartInfo = New-Object System.Diagnostics.ProcessStartInfo
                        $procStartInfo.FileName = $msCmd.Trim('"')
                        $procStartInfo.Arguments = "--version"
                        $procStartInfo.UseShellExecute = $false
                        $procStartInfo.RedirectStandardOutput = $true
                        $procStartInfo.RedirectStandardError = $true
                        $procStartInfo.CreateNoWindow = $true
                        $process = New-Object System.Diagnostics.Process
                        $process.StartInfo = $procStartInfo
                        $process.Start() | Out-Null
                        $process.WaitForExit(3000)
                        if ($process.ExitCode -eq 0 -or $?) { $msOk = $true }
                    }
                    catch {}
                }

                $responseObj = @{
                    success = $true
                    engines = @{
                        lilypond  = $lpOk
                        musescore = $msOk
                        osmd      = $true
                    }
                }
                $jsonResponse = ConvertTo-Json $responseObj -Depth 5
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            catch {
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.StatusCode = 500
                $response.ContentType = "application/json; charset=utf-8"
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.Close()
            continue
        }

        # --------------------------------------------------
        # ROUTE: POST /api/projects/export (Compile XML to PDF)
        # --------------------------------------------------
        if ($urlPath -eq "/api/projects/export" -and $request.HttpMethod -eq "POST") {
            try {
                $stream = $request.InputStream
                $reader = New-Object System.IO.StreamReader($stream)
                $jsonStr = $reader.ReadToEnd()
                
                $data = ConvertFrom-Json $jsonStr
                $xml = $data.xml
                $engine = $data.engine
                
                if ($null -eq $xml -or $null -eq $engine) {
                    throw "XML data and engine choice are required."
                }
                
                $taskId = [DateTime]::Now.Ticks
                $tempXmlPath = Join-Path $workDir "export_$($taskId).musicxml"
                $tempPdfPath = Join-Path $workDir "export_$($taskId).pdf"
                
                [System.IO.File]::WriteAllText($tempXmlPath, $xml)
                
                if ($engine -eq "musescore") {
                    $msCmd = Get-MuseScore-Command
                    Write-Host "Running MuseScore: $msCmd -o `"$tempPdfPath`" `"$tempXmlPath`"" -ForegroundColor DarkCyan
                    
                    $procStartInfo = New-Object System.Diagnostics.ProcessStartInfo
                    $procStartInfo.FileName = $msCmd.Trim('"')
                    $procStartInfo.Arguments = "-o `"$tempPdfPath`" `"$tempXmlPath`""
                    $procStartInfo.UseShellExecute = $false
                    $procStartInfo.RedirectStandardOutput = $true
                    $procStartInfo.RedirectStandardError = $true
                    $procStartInfo.CreateNoWindow = $true
                    
                    $process = New-Object System.Diagnostics.Process
                    $process.StartInfo = $procStartInfo
                    $process.Start() | Out-Null
                    $stdout = $process.StandardOutput.ReadToEnd()
                    $stderr = $process.StandardError.ReadToEnd()
                    $process.WaitForExit()
                    
                    try { Remove-Item $tempXmlPath -Force -ErrorAction SilentlyContinue } catch {}
                    
                    if ($process.ExitCode -ne 0 -or !(Test-Path $tempPdfPath)) {
                        try { Remove-Item (Join-Path $workDir "export_$($taskId)*") -Force -ErrorAction SilentlyContinue } catch {}
                        throw "MuseScore compilation failed: $stderr $stdout"
                    }
                }
                elseif ($engine -eq "lilypond") {
                    $lpInfo = Get-LilyPond-Command
                    $tempLyPath = Join-Path $workDir "export_$($taskId).ly"
                    
                    # Step 1: musicxml2ly
                    $procStartInfo = New-Object System.Diagnostics.ProcessStartInfo
                    $procStartInfo.FileName = $lpInfo.python.Trim('"')
                    $procStartInfo.Arguments = "`"$($lpInfo.musicxml2ly.Trim('"'))`" `"$tempXmlPath`" -o `"$tempLyPath`""
                    $procStartInfo.UseShellExecute = $false
                    $procStartInfo.RedirectStandardOutput = $true
                    $procStartInfo.RedirectStandardError = $true
                    $procStartInfo.CreateNoWindow = $true
                    
                    Write-Host "Running musicxml2ly: $($procStartInfo.FileName) $($procStartInfo.Arguments)" -ForegroundColor DarkCyan
                    $process = New-Object System.Diagnostics.Process
                    $process.StartInfo = $procStartInfo
                    $process.Start() | Out-Null
                    $stdout = $process.StandardOutput.ReadToEnd()
                    $stderr = $process.StandardError.ReadToEnd()
                    $process.WaitForExit()
                    
                    try { Remove-Item $tempXmlPath -Force -ErrorAction SilentlyContinue } catch {}
                    
                    if ($process.ExitCode -ne 0 -or !(Test-Path $tempLyPath)) {
                        try { Remove-Item (Join-Path $workDir "export_$($taskId)*") -Force -ErrorAction SilentlyContinue } catch {}
                        throw "MusicXML to LilyPond translation failed: $stderr $stdout"
                    }
                    
                    # Step 2: lilypond --pdf -o $workDir $tempLyPath
                    $procStartInfo = New-Object System.Diagnostics.ProcessStartInfo
                    $procStartInfo.FileName = $lpInfo.lilypond.Trim('"')
                    $procStartInfo.Arguments = "--pdf -o `"$workDir`" `"$tempLyPath`""
                    $procStartInfo.UseShellExecute = $false
                    $procStartInfo.RedirectStandardOutput = $true
                    $procStartInfo.RedirectStandardError = $true
                    $procStartInfo.CreateNoWindow = $true
                    
                    Write-Host "Running LilyPond: $($procStartInfo.FileName) $($procStartInfo.Arguments)" -ForegroundColor DarkCyan
                    $process = New-Object System.Diagnostics.Process
                    $process.StartInfo = $procStartInfo
                    $process.Start() | Out-Null
                    $stdout = $process.StandardOutput.ReadToEnd()
                    $stderr = $process.StandardError.ReadToEnd()
                    $process.WaitForExit()
                    
                    try { Remove-Item $tempLyPath -Force -ErrorAction SilentlyContinue } catch {}
                    
                    if ($process.ExitCode -ne 0 -or !(Test-Path $tempPdfPath)) {
                        try { Remove-Item (Join-Path $workDir "export_$($taskId)*") -Force -ErrorAction SilentlyContinue } catch {}
                        throw "LilyPond compilation failed: $stderr $stdout"
                    }
                }
                else {
                    throw "Invalid notation engine: $engine"
                }
                
                # Stream PDF to client
                $pdfBytes = [System.IO.File]::ReadAllBytes($tempPdfPath)
                
                $response.ContentType = "application/pdf"
                $response.Headers.Add("Content-Disposition", "attachment; filename=`"score.pdf`"")
                $response.StatusCode = 200
                $response.ContentLength64 = $pdfBytes.Length
                $response.OutputStream.Write($pdfBytes, 0, $pdfBytes.Length)
                
                try { $response.Close() } catch {}
                
                # Cleanup temp files
                try {
                    Get-ChildItem -Path $workDir -Filter "export_$($taskId)*" | Remove-Item -Force -ErrorAction SilentlyContinue
                }
                catch {}
                continue
            }
            catch {
                Write-Host "Export failed: $_" -ForegroundColor Red
                $responseObj = @{ success = $false; error = $_.ToString() }
                $jsonResponse = ConvertTo-Json $responseObj
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.StatusCode = 500
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                try { $response.Close() } catch {}
            }
            continue
        }

        # --------------------------------------------------
        # ROUTE: Static Files serving
        # --------------------------------------------------
        $cleanUrlPath = $urlPath.Replace("..", "").Replace("\", "/")
        if ($cleanUrlPath -eq "/" -or $cleanUrlPath -eq "") {
            $cleanUrlPath = "/index.html"
        }
        
        $localPath = Join-Path $publicDir $cleanUrlPath

        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css" { "text/css; charset=utf-8" }
                ".js" { "text/javascript; charset=utf-8" }
                ".png" { "image/png" }
                ".jpg" { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".svg" { "image/svg+xml" }
                ".pdf" { "application/pdf" }
                ".json" { "application/json" }
                ".xml" { "application/xml" }
                ".musicxml" { "application/xml" }
                default { "application/octet-stream" }
            }

            $response.ContentType = $contentType
            $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
            
            if ($request.HttpMethod -eq "GET") {
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            else {
                $response.ContentLength64 = 0
            }
            $response.StatusCode = 200
        }
        else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("File not found: $cleanUrlPath")
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $errBytes.Length
            if ($request.HttpMethod -eq "GET") {
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
        }
        $response.Close()
    }
    catch {
        Write-Host "Request handling error: $_" -ForegroundColor Yellow
    }
}

if ($listener.IsListening) {
    $listener.Close()
}
