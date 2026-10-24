# Reads "now playing" info from the Windows media session API (the same data the
# volume flyout shows) and streams it to the widget as one JSON object per line.
# Reads commands ("playpause", "next", "previous") from stdin, one per line.
# Runs under Windows PowerShell 5.1, which ships with Windows 10/11.

param(
  # Regex matched against the app id of the media session, e.g. "Spotify".
  # Empty string: follow whatever app Windows considers the current session.
  [string]$Source = 'Spotify'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($operation, [Type]$resultType) {
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}

function Emit($object) {
  [Console]::Out.WriteLine(($object | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
  ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-TargetSession {
  if ([string]::IsNullOrEmpty($Source)) { return $manager.GetCurrentSession() }
  foreach ($session in $manager.GetSessions()) {
    if ($session.SourceAppUserModelId -match $Source) { return $session }
  }
  return $null
}

function Get-ArtDataUri($thumbnail) {
  if ($null -eq $thumbnail) { return $null }
  try {
    $stream = Await ($thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $size = [uint32]$stream.Size
    if ($size -eq 0) { return $null }
    $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
    Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    $type = if ($stream.ContentType) { $stream.ContentType } else { 'image/jpeg' }
    $reader.Dispose()
    $stream.Dispose()
    return "data:$type;base64," + [Convert]::ToBase64String($bytes)
  } catch {
    return $null
  }
}

$lastTrackKey = $null
$lastArt = $null
$lastJson = $null

function Send-State([bool]$force) {
  $session = Get-TargetSession
  if ($null -eq $session) {
    $script:lastTrackKey = $null
    $state = @{ type = 'state'; active = $false }
  } else {
    $props = Await ($session.TryGetMediaPropertiesAsync()) `
      ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $timeline = $session.GetTimelineProperties()
    $playback = $session.GetPlaybackInfo()

    $trackKey = "$($props.Artist)|$($props.Title)|$($props.AlbumTitle)"
    $artChanged = $trackKey -ne $script:lastTrackKey
    if ($artChanged) {
      $script:lastTrackKey = $trackKey
      $script:lastArt = Get-ArtDataUri $props.Thumbnail
    }

    $state = @{
      type        = 'state'
      active      = $true
      app         = $session.SourceAppUserModelId
      title       = $props.Title
      artist      = $props.Artist
      album       = $props.AlbumTitle
      status      = $playback.PlaybackStatus.ToString()
      positionMs  = [int64]$timeline.Position.TotalMilliseconds
      durationMs  = [int64]($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
      updatedAtMs = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
      canNext     = $playback.Controls.IsNextEnabled
      canPrevious = $playback.Controls.IsPreviousEnabled
    }
    # Album art is large; only send it when the track changes (or on request).
    if ($artChanged -or $force) { $state.art = $script:lastArt }
  }

  $json = $state | ConvertTo-Json -Compress -Depth 4
  if ($force -or $json -ne $script:lastJson) {
    $script:lastJson = $json
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  }
}

function Invoke-MediaCommand([string]$command) {
  $session = Get-TargetSession
  if ($null -eq $session) { return }
  switch ($command.Trim()) {
    'playpause' { Await ($session.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
    'next'      { Await ($session.TrySkipNextAsync()) ([bool]) | Out-Null }
    'previous'  { Await ($session.TrySkipPreviousAsync()) ([bool]) | Out-Null }
  }
}

# A StreamReader over the raw stdin stream gives a truly asynchronous ReadLineAsync,
# so the poll loop keeps running while we wait for commands.
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pendingLine = $stdin.ReadLineAsync()
$nextPoll = [DateTime]::MinValue
$forceNext = $true

while ($true) {
  if ($pendingLine.IsCompleted) {
    $line = $pendingLine.Result
    if ($null -eq $line) { break } # stdin closed: the app exited
    try {
      if ($line.Trim() -eq 'refresh') { $forceNext = $true } else { Invoke-MediaCommand $line }
    } catch {
      Emit @{ type = 'error'; message = $_.Exception.Message }
    }
    $pendingLine = $stdin.ReadLineAsync()
    # Give the player a moment to apply the command, then report the new state.
    $nextPoll = [DateTime]::Now.AddMilliseconds(250)
  }

  if ([DateTime]::Now -ge $nextPoll) {
    try {
      Send-State $forceNext
      $forceNext = $false
    } catch {
      Emit @{ type = 'error'; message = $_.Exception.Message }
    }
    $nextPoll = [DateTime]::Now.AddMilliseconds(1000)
  }

  Start-Sleep -Milliseconds 100
}
