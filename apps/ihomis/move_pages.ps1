$basePath = "d:\Documents_FromC\WAH4PCE-Merge Conflict\apps\ihomis\src\app"
$portalPath = "$basePath\(portal)"

$pages = @("records", "inbox", "send", "save", "request")

foreach ($page in $pages) {
    $src = "$basePath\$page\page.tsx"
    $dest = "$portalPath\$page"

    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

    $content = Get-Content $src -Raw

    # Remove sidebar import
    $content = $content -replace "import PortalSidebar from '@/components/Sidebar';\r?\n", ""

    # Replace the wrapper pattern: <div className="flex min-h-screen">\n      <PortalSidebar />\n      <main className="flex-1 p-6 overflow-auto">
    $content = $content -replace '    <div className="flex min-h-screen">\r?\n      <PortalSidebar />\r?\n      <main className="flex-1 p-6 overflow-auto">', '    <>'

    # Replace closing: </main>\n    </div>
    $content = $content -replace '      </main>\r?\n    </div>', '    </>'

    # Also handle the <> pattern (send page uses different layout)
    $content = $content -replace '    <>\r?\n      <PortalSidebar />\r?\n      <main className="flex-1 p-6 overflow-auto">', '    <>'
    $content = $content -replace '      </main>\r?\n    </>', '    </>'

    Set-Content -Path "$dest\page.tsx" -Value $content -NoNewline
    Write-Host "Moved $page"
}

# Remove old directories
foreach ($page in $pages) {
    Remove-Item -Recurse -Force "$basePath\$page" -ErrorAction SilentlyContinue
}

Write-Host "Done - all pages moved to (portal)/"
