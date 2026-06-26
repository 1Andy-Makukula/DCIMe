Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

function Get-SharedStrings($zip) {
    $entry = $zip.GetEntry("xl/sharedStrings.xml")
    if ($null -eq $entry) { return @() }
    
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $xmlText = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    
    [xml]$xml = $xmlText
    $ns = New-Object Xml.XmlNamespaceManager $xml.NameTable
    $ns.AddNamespace("ns", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    
    $strings = @()
    $siNodes = $xml.SelectNodes("//ns:si", $ns)
    foreach ($si in $siNodes) {
        $tNodes = $si.SelectNodes(".//ns:t", $ns)
        $text = ""
        foreach ($t in $tNodes) {
            $text += $t.InnerText
        }
        $strings += $text
    }
    return $strings
}

function Get-Sheets($zip) {
    $entry = $zip.GetEntry("xl/workbook.xml")
    if ($null -eq $entry) { return @() }
    
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $xmlText = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    
    [xml]$xml = $xmlText
    $ns = New-Object Xml.XmlNamespaceManager $xml.NameTable
    $ns.AddNamespace("ns", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    $ns.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    
    $sheets = @()
    $sheetNodes = $xml.SelectNodes("//ns:sheet", $ns)
    
    $relEntry = $zip.GetEntry("xl/_rels/workbook.xml.rels")
    $rels = @{}
    if ($null -ne $relEntry) {
        $relStream = $relEntry.Open()
        $relReader = New-Object System.IO.StreamReader($relStream)
        $relXmlText = $relReader.ReadToEnd()
        $relReader.Close()
        $relStream.Close()
        [xml]$relXml = $relXmlText
        $relNs = New-Object Xml.XmlNamespaceManager $relXml.NameTable
        $relNs.AddNamespace("rel", "http://schemas.openxmlformats.org/package/2006/relationships")
        foreach ($r in $relXml.SelectNodes("//rel:Relationship", $relNs)) {
            $rels[$r.Id] = $r.Target
        }
    }
    
    foreach ($s in $sheetNodes) {
        $name = $s.name
        $rId = $s.id
        $target = $rels[$rId]
        if ($null -eq $target) {
            $target = "worksheets/sheet" + $s.sheetId + ".xml"
        }
        if (-not $target.StartsWith("xl/")) {
            $target = "xl/" + $target
        }
        $sheets += [PSCustomObject]@{ Name = $name; Path = $target }
    }
    return $sheets
}

function Convert-ColRef($ref) {
    if ($ref -match "^([A-Z]+)([0-9]+)$") {
        $colStr = $Matches[1]
        $rowNum = [int]$Matches[2]
        $colIdx = 0
        for ($i = 0; $i -lt $colStr.Length; $i++) {
            $colIdx = $colIdx * 26 + ([char]$colStr[$i] - [char]'A' + 1)
        }
        return @($colIdx - 1, $rowNum)
    }
    return @(0, 0)
}

function Analyze-Sheet($zip, $sheetPath, $sheetName, $sharedStrings) {
    $entry = $zip.GetEntry($sheetPath)
    if ($null -eq $entry) {
        Write-Host "Sheet file not found: $sheetPath"
        return
    }
    
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $xmlText = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    
    [xml]$xml = $xmlText
    $ns = New-Object Xml.XmlNamespaceManager $xml.NameTable
    $ns.AddNamespace("ns", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    
    $grid = @{}
    $maxRow = 0
    $maxCol = 0
    
    $cNodes = $xml.SelectNodes("//ns:c", $ns)
    foreach ($c in $cNodes) {
        $ref = $c.r
        $coords = Convert-ColRef $ref
        $colIdx = $coords[0]
        $rowNum = $coords[1]
        
        $t = $c.t
        $vNode = $c.SelectSingleNode("ns:v", $ns)
        $val = ""
        if ($null -ne $vNode) {
            $val = $vNode.InnerText
            if ($t -eq "s") {
                $idx = [int]$val
                if ($idx -lt $sharedStrings.Count) {
                    $val = $sharedStrings[$idx]
                }
            }
        } else {
            $isNode = $c.SelectSingleNode(".//ns:t", $ns)
            if ($null -ne $isNode) {
                $val = $isNode.InnerText
            }
        }
        
        $fNode = $c.SelectSingleNode("ns:f", $ns)
        if ($null -ne $fNode -and $fNode.InnerText) {
            $val = "[=" + $fNode.InnerText + "]"
        }
        
        if ($val) {
            $key = "$rowNum,$colIdx"
            $grid[$key] = $val
            if ($rowNum -gt $maxRow) { $maxRow = $rowNum }
            if ($colIdx -gt $maxCol) { $maxCol = $colIdx }
        }
    }
    
    Write-Host "`n--- SHEET DETAILS: `"$sheetName`" ---"
    $limitRows = [Math]::Min($maxRow, 45)
    $limitCols = [Math]::Min($maxCol + 1, 75)
    
    for ($r = 1; $r -le $limitRows; $r++) {
        $colsStr = @()
        $hasValue = $false
        for ($c = 0; $c -lt $limitCols; $c++) {
            $key = "$r,$c"
            $val = $grid[$key]
            if ($val) {
                $hasValue = $true
                $colLetter = ""
                $temp = $c + 1
                while ($temp -gt 0) {
                    $modulo = ($temp - 1) % 26
                    $colLetter = [char](65 + $modulo) + $colLetter
                    $temp = [Math]::Floor(($temp - $modulo) / 26)
                }
                $displayVal = $val
                if ($displayVal.Length -gt 45) {
                    $displayVal = $displayVal.Substring(0, 42) + "..."
                }
                $colsStr += "$($colLetter)$($r): `"$($displayVal)`""
            }
        }
        if ($hasValue) {
            Write-Host ("Row {0:D2}: " -f $r) ($colsStr -join " | ")
        }
    }
}

function Analyze-Workbook($filePath) {
    if (-not (Test-Path $filePath)) {
        Write-Host "File not found: $filePath"
        return
    }
    Write-Host "`n================================================================"
    Write-Host "ANALYZING WORKBOOK: $(Split-Path $filePath -Leaf)"
    Write-Host "================================================================"
    
    $zip = [System.IO.Compression.ZipFile]::OpenRead($filePath)
    $sharedStrings = Get-SharedStrings $zip
    $sheets = Get-Sheets $zip
    
    Write-Host "Sheets in workbook ($($sheets.Count)):"
    foreach ($s in $sheets) {
        Write-Host "  - `"$($s.Name)`" -> $($s.Path)"
    }
    
    foreach ($s in $sheets) {
        $isDaily = $filePath -like "*daily_canvas*"
        $isComm = $filePath -like "*commercial_logbook*"
        
        $isDailySample = $isDaily -and (($s.Name -in @('01', '1', 'DYNAMIC_DAY', 'Template')) -or ($s.Name -eq $sheets[0].Name))
        $isCommSample = $isComm -and ($s.Name -in @('Commercial Power Log', 'Temp Record', 'PAC', 'DG Check', 'Fuel Record', 'Eqpt status', 'Eqpt Status'))
        
        if ($isDailySample -or $isCommSample) {
            Analyze-Sheet $zip $s.Path $s.Name $sharedStrings
        }
    }
    
    $zip.Dispose()
}

$projectRoot = "c:\Users\Owner\Downloads\DCIMe_Engine"
$dailyCanvasPath = Join-Path $projectRoot "public\template_daily_canvas.xlsx.xlsx"
$commercialLogbookPath = Join-Path $projectRoot "public\template_commercial_logbook.xlsx.xlsx"

Analyze-Workbook $dailyCanvasPath
Analyze-Workbook $commercialLogbookPath
