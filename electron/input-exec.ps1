$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FS {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern short VkKeyScan(char ch);
}
"@

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq '') { continue }
  try {
    $cmd = $line | ConvertFrom-Json
    $t = [string]$cmd.t
    if ($t -eq 'move') {
      [FS]::SetCursorPos([int]$cmd.x, [int]$cmd.y) | Out-Null
    }
    elseif ($t -eq 'moverel') {
      [FS]::mouse_event(0x0001, [int]$cmd.dx, [int]$cmd.dy, 0, [UIntPtr]::Zero) | Out-Null
    }
    elseif ($t -eq 'button') {
      $down = [bool]$cmd.down
      $b = [string]$cmd.b
      $f = 0
      if ($b -eq 'left') { $f = if ($down) { 0x02 } else { 0x04 } }
      elseif ($b -eq 'right') { $f = if ($down) { 0x08 } else { 0x10 } }
      elseif ($b -eq 'middle') { $f = if ($down) { 0x20 } else { 0x40 } }
      if ($f -gt 0) { [FS]::mouse_event([uint32]$f, 0, 0, 0, [UIntPtr]::Zero) | Out-Null }
    }
    elseif ($t -eq 'wheel') {
      [FS]::mouse_event(0x0800, 0, 0, [int]$cmd.d, [UIntPtr]::Zero) | Out-Null
    }
    elseif ($t -eq 'key') {
      $key = [string]$cmd.k
      $down = [bool]$cmd.down
      $flags = if ($down) { 0 } else { 2 }
      $vk = 0
      $upper = $key.ToUpper()
      switch -Regex ($upper) {
        '^F([1-9]|1[0-9]|2[0-4])$' { $vk = 0x70 + [int]$Matches[1] - 1 }
        '^ENTER$' { $vk = 0x0D }
        '^TAB$' { $vk = 0x09 }
        '^ESCAPE$' { $vk = 0x1B }
        '^BACKSPACE$' { $vk = 0x08 }
        '^DELETE$' { $vk = 0x2E }
        '^SHIFT$' { $vk = 0x10 }
        '^CONTROL$' { $vk = 0x11 }
        '^ALT$' { $vk = 0x12 }
        '^CAPSLOCK$' { $vk = 0x14 }
        '^ARROWUP$' { $vk = 0x26 }
        '^ARROWDOWN$' { $vk = 0x28 }
        '^ARROWLEFT$' { $vk = 0x25 }
        '^ARROWRIGHT$' { $vk = 0x27 }
        '^HOME$' { $vk = 0x24 }
        '^END$' { $vk = 0x23 }
        '^PAGEUP$' { $vk = 0x21 }
        '^PAGEDOWN$' { $vk = 0x22 }
        default {
          if ($key.Length -eq 1) {
            $scan = [FS]::VkKeyScan([char]$key[0])
            $vk = $scan -band 0xFF
            $shift = ($scan -band 0x100) -ne 0
            if ($shift) { [FS]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero) | Out-Null }
            [FS]::keybd_event([byte]$vk, 0, $flags, [UIntPtr]::Zero) | Out-Null
            if ($shift) { [FS]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero) | Out-Null }
            $vk = -1
          }
        }
      }
      if ($vk -gt 0) { [FS]::keybd_event([byte]$vk, 0, $flags, [UIntPtr]::Zero) | Out-Null }
    }
  } catch { }
}
