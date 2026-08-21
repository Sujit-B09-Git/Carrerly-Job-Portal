$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$schemaPath = Join-Path $projectDirectory 'database\schema.sql'
$environmentPath = Join-Path $projectDirectory '.env'

$mysqlCommand = Get-Command mysql.exe -ErrorAction SilentlyContinue
if ($mysqlCommand) {
  $mysqlExecutable = $mysqlCommand.Source
} else {
  $knownMysqlPath = 'C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe'
  if (-not (Test-Path -LiteralPath $knownMysqlPath)) {
    throw 'MySQL client was not found. Install MySQL Server and run this command again.'
  }
  $mysqlExecutable = $knownMysqlPath
}

Write-Host 'Careerly MySQL setup' -ForegroundColor Cyan
Write-Host 'Enter the existing MySQL root password. It will not be saved.'
$secureRootPassword = Read-Host 'MySQL root password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureRootPassword)

try {
  $rootPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $appPasswordBytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($appPasswordBytes)
  $appPassword = [Convert]::ToBase64String($appPasswordBytes)
  $jwtBytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
  $jwtSecret = [Convert]::ToBase64String($jwtBytes)

  $temporarySchemaPath = Join-Path ([IO.Path]::GetTempPath()) ("careerly-schema-{0}.sql" -f [Guid]::NewGuid().ToString('N'))
  $schemaContent = [IO.File]::ReadAllText($schemaPath).Replace('replace_with_a_strong_password', $appPassword)
  [IO.File]::WriteAllText($temporarySchemaPath, $schemaContent, [Text.UTF8Encoding]::new($false))

  $env:MYSQL_PWD = $rootPassword
  $mysqlSourcePath = $temporarySchemaPath.Replace('\', '/')
  & $mysqlExecutable --protocol=TCP --host=127.0.0.1 --port=3306 --user=root --execute="SOURCE $mysqlSourcePath;"
  if ($LASTEXITCODE -ne 0) { throw 'MySQL rejected the setup request. Check the root password and try again.' }

  $escapedAppPassword = $appPassword.Replace("'", "''")
  & $mysqlExecutable --protocol=TCP --host=127.0.0.1 --port=3306 --user=root --execute="ALTER USER 'careerly_app'@'localhost' IDENTIFIED BY '$escapedAppPassword'; GRANT SELECT, INSERT, UPDATE, DELETE ON careerly.* TO 'careerly_app'@'localhost'; FLUSH PRIVILEGES;"
  if ($LASTEXITCODE -ne 0) { throw 'The database was created, but the Careerly application user could not be configured.' }

  $environmentContent = @"
PORT=3000
NODE_ENV=development

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=careerly_app
DB_PASSWORD=$appPassword
DB_NAME=careerly
DB_CONNECTION_LIMIT=10

JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=8h
"@
  [IO.File]::WriteAllText($environmentPath, $environmentContent, [Text.UTF8Encoding]::new($false))
  Write-Host 'Careerly database and .env were configured successfully.' -ForegroundColor Green
  Write-Host 'Run npm run start:mysql, then open http://localhost:3000/login.html'
} finally {
  $env:MYSQL_PWD = $null
  if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
  if ($temporarySchemaPath -and (Test-Path -LiteralPath $temporarySchemaPath)) { Remove-Item -LiteralPath $temporarySchemaPath -Force }
}
