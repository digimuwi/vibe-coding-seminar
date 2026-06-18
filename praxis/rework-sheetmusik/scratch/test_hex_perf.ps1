$hex = "a1b2c3d4" * 10000 # 80KB hex string

$sw1 = [System.Diagnostics.Stopwatch]::StartNew()
$bytes1 = New-Object byte[] ($hex.Length / 2)
for ($i = 0; $i -lt $bytes1.Length; $i++) {
    $bytes1[$i] = [System.Convert]::ToByte($hex.Substring(($i * 2), 2), 16)
}
$sw1.Stop()
$res1 = "Method 1 (Loop): $($sw1.ElapsedMilliseconds) ms"

$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $soapHex = New-Object System.Runtime.Remoting.Metadata.W3cXsd2001.SoapHexBinary
    $soapHex.Value = $hex
    $bytes2 = $soapHex.Value
    $sw2.Stop()
    $res2 = "Method 2 (SoapHexBinary): $($sw2.ElapsedMilliseconds) ms"
} catch {
    $sw2.Stop()
    $res2 = "Method 2 failed: $_"
}

Write-Output $res1
Write-Output $res2
