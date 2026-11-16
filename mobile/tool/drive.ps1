# Drives the Android emulator through adb: taps, typing, keys, waits and screenshots.
# Usage: powershell -ExecutionPolicy Bypass -File tool\drive.ps1 "tap 1201 255,wait 1,shot login"
# Steps are separated by commas. Coordinates are in device pixels (1344 x 2992 on the Pixel 10 Pro XL emulator).
#   tap X Y      touch the screen
#   text WORDS   type into the focused field (spaces are allowed; commas are not)
#   key CODE     Android key code, for example 4 = Back, 66 = Enter, 67 = Delete
#   wait SECS    pause
#   swipe X1 Y1 X2 Y2   drag from one point to another
#   push NAME    copy build\photos\NAME to the phone's Pictures folder and refresh the gallery
#   clear        empty the focused field (select all, delete)
#   reset        wipe the app's data and start it again (signed out, first launch)
#   open         bring the app to the front (starts it if needed)
#   shot NAME    save a screenshot to build\shots\NAME.png
param([Parameter(Mandatory = $true)][string]$Steps)

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$out = Join-Path $PSScriptRoot '..\build\shots'
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($raw in $Steps.Split(',')) {
  $step = $raw.Trim()
  if (-not $step) { continue }
  $parts = $step.Split(' ', 2)
  switch ($parts[0]) {
    'tap'  { $xy = $parts[1].Split(' '); & $adb shell input tap $xy[0] $xy[1] }
    'text' { & $adb shell input text ($parts[1].Replace(' ', '%s')) }
    'key'  { & $adb shell input keyevent $parts[1] }
    'swipe' { $p = $parts[1].Split(' '); & $adb shell input swipe $p[0] $p[1] $p[2] $p[3] 400 }
    'push' {
      $file = Join-Path $PSScriptRoot ('..\build\photos\' + $parts[1])
      & $adb push $file ('/sdcard/Pictures/' + $parts[1]) | Out-Null
      & $adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d ('file:///sdcard/Pictures/' + $parts[1]) | Out-Null
    }
    'clear' { & $adb shell input keycombination 113 29; & $adb shell input keyevent 67 }
    'reset' {
      & $adb shell pm clear com.ewaste.ewaste_opportunity | Out-Null
      & $adb shell monkey -p com.ewaste.ewaste_opportunity -c android.intent.category.LAUNCHER 1 | Out-Null
    }
    'open' { & $adb shell monkey -p com.ewaste.ewaste_opportunity -c android.intent.category.LAUNCHER 1 | Out-Null }
    'wait' { Start-Sleep -Seconds ([double]$parts[1]) }
    'shot' {
      & $adb shell screencap -p /sdcard/shot.png
      & $adb pull /sdcard/shot.png (Join-Path $out ($parts[1] + '.png')) | Out-Null
    }
    default { Write-Host "Unknown step: $step" }
  }
}
Write-Host 'done'
