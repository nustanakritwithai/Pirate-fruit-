param(
  [string]$Gameplay = "$PSScriptRoot/../client/src/combat/skillGameplay/generated.ts",
  [string]$OutputPath = "$PSScriptRoot/../shared/src/combat/skillResources.ts"
)
$rows = @()
foreach ($line in Get-Content -LiteralPath $Gameplay) {
  $id = [regex]::Match($line, "^\s*'([^']+)': \{.*slot: '([^']+)', archetype: '([^']+)'")
  $cast = [regex]::Match($line, 'castTime: ([0-9.]+)')
  $cost = [regex]::Match($line, 'cooldown: ([0-9.]+), energy: ([0-9]+)')
  if ($id.Success -and $cast.Success -and $cost.Success) {
    $rows += "  '$($id.Groups[1].Value)': { id: '$($id.Groups[1].Value)', slot: '$($id.Groups[2].Value)', archetype: '$($id.Groups[3].Value)', castTimeMs: $([double]$cast.Groups[1].Value * 1000), cooldownMs: $([double]$cost.Groups[1].Value * 1000), mpCost: $($cost.Groups[2].Value) },"
  }
}
if ($rows.Count -ne 431) { throw "Expected 431 generated skills, got $($rows.Count)" }
$mastery = @{}
foreach ($file in @(
  "$PSScriptRoot/../client/src/fruit/skills/databook/skills.ts",
  "$PSScriptRoot/../client/src/swords/skills/databook/skills.ts",
  "$PSScriptRoot/../client/src/guns/skills/databook/skills.ts",
  "$PSScriptRoot/../client/src/fighting-styles/skills/databook/skills.ts")) {
  $raw = Get-Content -LiteralPath $file -Raw
  foreach ($match in [regex]::Matches($raw, '(?s)\{\s*"id"\s*:\s*"([^"]+)".*?"mastery"\s*:\s*([0-9]+).*?\}')) {
    $mastery[$match.Groups[1].Value] = [int]$match.Groups[2].Value
  }
}
if ($mastery.Count -ne 414) { throw "Expected 414 mastery records, got $($mastery.Count)" }
$generated = @(
  '/** Generated from client skillGameplay catalog; do not hand-edit. */',
  'export interface SkillResourceCatalogEntry { id: string; slot: string; archetype: string; castTimeMs: number; cooldownMs: number; mpCost: number; }',
  'export const SKILL_RESOURCE_CATALOG: Readonly<Record<string, SkillResourceCatalogEntry>> = {'
) + $rows + @('};', '', 'export const SKILL_MASTERY_REQUIRED: Readonly<Record<string, number>> = {')
foreach ($id in ($mastery.Keys | Sort-Object)) { $generated += "  '$id': $($mastery[$id])," }
$generated += '};'
$generated | Out-File -LiteralPath $OutputPath -Encoding utf8
