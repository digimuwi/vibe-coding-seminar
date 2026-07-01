try {
    $hex = "a1b2c3d4e5f6"
    Write-Host "Input Hex: $hex"
    
    # Test Parse
    $soap = [System.Runtime.Remoting.Metadata.W3cXsd2001.SoapHexBinary]::Parse($hex)
    $bytes = $soap.Value
    Write-Host "Parsed Bytes: $($bytes -join ', ')"
    
    # Test performance on larger string
    $largeHex = "a1b2c3d4" * 50000 # 400KB
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $largeSoap = [System.Runtime.Remoting.Metadata.W3cXsd2001.SoapHexBinary]::Parse($largeHex)
    $largeBytes = $largeSoap.Value
    $sw.Stop()
    Write-Host "SoapHexBinary 400KB conversion time: $($sw.ElapsedMilliseconds) ms (Length: $($largeBytes.Length))"
    
} catch {
    Write-Host "Error occurred: $_"
    Write-Host $_.ScriptStackTrace
}
