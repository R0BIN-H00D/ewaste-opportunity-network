# Acts as the demo technician (tech@demo.local) on the most recent repair request, so the owner side in the app can be tried end to end.
# Usage: powershell -ExecutionPolicy Bypass -File tool\tech.ps1 "accept,show"
# Steps are separated by commas:
#   show       print the request's status and what the technician can do next
#   accept     take the request
#   handover   confirm the handover from the technician's side (pickup, or the return of the device)
#   diagnose   start checking the device
#   quote      send a quote of 2,500 (screen 2,000 + labour 500)
#   complete   mark the repair done, with one photo (build\photos\test1.jpg)
#   deliver    start bringing the device back, due tomorrow 5 pm - 7 pm
# Only for development: it logs in with the seeded demo password.
param(
    [Parameter(Mandatory = $true)][string]$Steps,
    [string]$Api = 'http://localhost:5000/api',
    [string]$RequestId = ''
)
$ErrorActionPreference = 'Stop'

function Send($method, $path, $body, $token) {
    $headers = @{ 'X-Client-Type' = 'mobile' }
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    $args = @{ Method = $method; Uri = "$Api$path"; Headers = $headers }
    if ($null -ne $body) { $args['Body'] = ($body | ConvertTo-Json -Depth 6); $args['ContentType'] = 'application/json' }
    try {
        return (Invoke-RestMethod @args).data
    } catch {
        $detail = $_.ErrorDetails.Message
        if ($detail) { throw "Server said: $detail" } else { throw $_ }
    }
}

$login = Send 'POST' '/auth/login' @{ email = 'tech@demo.local'; password = 'Demo@12345' } $null
$token = $login.accessToken

if (-not $RequestId) {
    $latest = Send 'GET' '/service-requests?as=technician&limit=1' $null $token
    if (-not $latest -or $latest.Count -eq 0) { throw 'The technician has no requests yet. Send one from the app first.' }
    $RequestId = @($latest)[0]._id
}
$base = "/service-requests/$RequestId"

foreach ($step in $Steps.Split(',')) {
    $name = $step.Trim()
    switch ($name) {
        'show' { }
        'accept' { $null = Send 'PUT' "$base/status" @{ status = 'technician_assigned' } $token }
        'handover' { $null = Send 'POST' "$base/handover" @{} $token }
        'diagnose' { $null = Send 'PUT' "$base/status" @{ status = 'diagnosis_in_progress' } $token }
        'quote' {
            $null = Send 'POST' "$base/quotation" @{
                amount = 2500
                breakdown = @(@{ label = 'Screen replacement'; amount = 2000 }, @{ label = 'Labour'; amount = 500 })
                parts = @('Display')
                etaDays = 3
                notes = 'Genuine part, three months warranty.'
            } $token
        }
        'complete' {
            $photo = Join-Path $PSScriptRoot '..\build\photos\test1.jpg'
            $out = & curl.exe -s -X PUT -H "Authorization: Bearer $token" -F 'status=repair_completed' -F 'note=Screen replaced and tested' -F "photos=@$photo;type=image/jpeg" "$Api$base/status"
            if ($out -match '"success":\s*false') { throw "Server said: $out" }
        }
        'deliver' {
            # Says the device comes back tomorrow at 5 pm, in the evening slot.
            $back = (Get-Date).Date.AddDays(1).AddHours(17).ToUniversalTime().ToString('o')
            $null = Send 'PUT' "$base/status" @{ status = 'device_delivery_pending'; returnDate = $back; returnSlot = '5 pm - 7 pm' } $token
        }
        default { throw "Unknown step '$name'" }
    }
    $now = Send 'GET' $base $null $token
    Write-Host ("{0,-9} -> status: {1}; can do: {2}" -f $name, $now.status, ($now.actions -join ', '))
}
