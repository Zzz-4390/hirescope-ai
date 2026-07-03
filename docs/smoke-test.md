# 后端 Smoke Test

本文档验证当前后端链路：API 接收项目 ZIP，经 BullMQ 投递给 Worker，Worker 完成
`deterministic-v1` 静态分析并写入 PostgreSQL，随后异步清理项目文件。

## 1. 启动基础设施

在仓库根目录执行：

```powershell
pnpm infra:up
docker compose ps
pnpm db:deploy
```

`postgres` 和 `redis` 的状态都应为 `healthy`。

## 2. 启动 API 和 Worker

打开两个 PowerShell 终端，工作目录都必须是仓库根目录。

终端一：

```powershell
pnpm api:dev
```

终端二：

```powershell
pnpm worker:dev
```

保持两个进程运行。默认 API 地址为 `http://127.0.0.1:3001/api/v1`。

## 3. 注册和登录

```powershell
$baseUrl = 'http://127.0.0.1:3001/api/v1'
$email = "smoke+$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
$password = 'SmokeTest123!'

Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/register" `
  -ContentType 'application/json' `
  -Body (@{
    email = $email
    password = $password
    displayName = 'Smoke User'
  } | ConvertTo-Json)

$login = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/login" `
  -ContentType 'application/json' `
  -Body (@{ email = $email; password = $password } | ConvertTo-Json)

$token = $login.accessToken
$authorization = @{ Authorization = "Bearer $token" }
```

注册应返回 HTTP `202`，登录应返回 HTTP `200` 和 `accessToken`。

## 4. 准备最小 ZIP

```powershell
$source = Join-Path $env:TEMP 'hirescope-smoke-project'
$zip = Join-Path $env:TEMP 'hirescope-smoke-project.zip'

Remove-Item -LiteralPath $source, $zip -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $source 'src') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $source 'package.json') `
  -Value '{"name":"smoke-project","version":"1.0.0","dependencies":{"typescript":"^5.0.0"}}'
Set-Content -LiteralPath (Join-Path $source 'src/index.ts') `
  -Value 'export const message: string = "smoke test";'
Set-Content -LiteralPath (Join-Path $source 'README.md') -Value '# Smoke Project'
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zip -Force
```

## 5. 上传并查询分析结果

PowerShell 5 的 `Invoke-RestMethod` 不支持方便的 multipart 上传，因此这里使用系统
`curl.exe`：

```powershell
$uploadResponse = curl.exe -sS `
  -H "Authorization: Bearer $token" `
  -F 'name=Smoke TypeScript Project' `
  -F 'description=Backend smoke test' `
  -F "file=@$zip;type=application/zip" `
  "$baseUrl/projects" | ConvertFrom-Json

$projectId = $uploadResponse.project.id
$analysisTaskId = $uploadResponse.task.id

do {
  Start-Sleep -Milliseconds 500
  $analysisTask = Invoke-RestMethod -Method Get `
    -Uri "$baseUrl/tasks/$analysisTaskId" -Headers $authorization
} until ($analysisTask.status -in @('SUCCEEDED', 'FAILED', 'CANCELLED'))

$project = Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/projects/$projectId" -Headers $authorization
$analysis = Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/projects/$projectId/analysis" -Headers $authorization

$analysisTask
$project
$analysis
```

预期结果：分析任务为 `SUCCEEDED`、进度为 `100`，项目为 `COMPLETED`，分析结果的
`analyzerVersion` 为 `deterministic-v1`。

## 6. 删除项目并查询清理任务

```powershell
$cleanupTask = Invoke-RestMethod -Method Delete `
  -Uri "$baseUrl/projects/$projectId" -Headers $authorization

do {
  Start-Sleep -Milliseconds 500
  $cleanupStatus = Invoke-RestMethod -Method Get `
    -Uri "$baseUrl/tasks/$($cleanupTask.id)" -Headers $authorization
} until ($cleanupStatus.status -in @('SUCCEEDED', 'FAILED', 'CANCELLED'))

$cleanupStatus
```

预期清理任务为 `SUCCEEDED`、进度为 `100`。数据库中的项目状态为 `DELETED`，
`zip_storage_path` 和 `extract_storage_path` 均为空；再次查询项目详情返回 HTTP `404`。

## 7. 最小失败场景

未携带 `Authorization` 上传 ZIP 应返回 HTTP `401`：

```powershell
curl.exe -i -F 'name=Unauthorized' -F "file=@$zip;type=application/zip" "$baseUrl/projects"
```

上传非 ZIP 文件应返回 HTTP `415`：

```powershell
$textFile = Join-Path $env:TEMP 'not-a-zip.txt'
Set-Content -LiteralPath $textFile -Value 'not a zip'
curl.exe -i -H "Authorization: Bearer $token" `
  -F 'name=Invalid file' -F "file=@$textFile;type=text/plain" "$baseUrl/projects"
```

使用另一个用户的 Token 查询 `$projectId` 应返回 HTTP `404`，避免泄露资源是否存在。

## 8. 创建并查询确定性代码审查

重新执行第 4、5 节创建一个尚未删除的项目，并在项目分析任务成功后执行：

```powershell
$review = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/projects/$projectId/code-reviews" -Headers $authorization
$codeReviewId = $review.id

do {
  Start-Sleep -Milliseconds 500
  $reviewDetail = Invoke-RestMethod -Method Get `
    -Uri "$baseUrl/code-reviews/$codeReviewId" -Headers $authorization
} until ($reviewDetail.status -in @('SUCCEEDED', 'FAILED', 'CANCELLED'))

$history = Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/projects/$projectId/code-reviews?page=1&pageSize=20" `
  -Headers $authorization

$reviewDetail
$history
```

预期审查状态和关联任务均为 `SUCCEEDED`，`model` 为
`deterministic-code-review-v1`，`result` 包含 `overview`、`strengths`、`risks`、
`suggestions`、`maintainability`、`security` 和 `performance`。本流程不调用 AI。

## 9. 创建并查询确定性模拟面试题

准备一个状态为 `COMPLETED` 的 `$projectId` 后执行：

```powershell
$interview = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/projects/$projectId/interviews" `
  -Headers $authorization -ContentType 'application/json' `
  -Body (@{ questionCount = 8; difficulty = 'MEDIUM' } | ConvertTo-Json)

do {
  Start-Sleep -Milliseconds 500
  $interviewDetail = Invoke-RestMethod -Method Get `
    -Uri "$baseUrl/interviews/$($interview.id)" -Headers $authorization
} until ($interviewDetail.status -in @('READY', 'FAILED'))

$interviews = Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/projects/$projectId/interviews?page=1&pageSize=20" `
  -Headers $authorization

$interviewDetail
$interviews
```

预期状态为 `READY`，题目数量为 `8`，`sequence` 从 `1` 连续递增。接口不会返回
内部使用的 `referencePoints`。本流程只使用确定性生成器，不调用 AI。

## 10. 常见问题排查

- `docker compose ps` 不是 `healthy`：确认 Docker Desktop 已启动，且本机 `5432`、`6379`
  端口未被占用。
- Prisma 报数据库连接错误：检查 `.env` 中 `DATABASE_URL`，再运行 `pnpm db:deploy`。
- 任务长期停留在 `QUEUED`：确认 `pnpm worker:dev` 正在仓库根目录运行，并检查 Redis。
- 任务报 `PROJECT_ANALYSIS_FAILED`：确认 API 和 Worker 都通过根级脚本启动，二者必须共享
  同一个 `STORAGE_ROOT`。
- API 启动时报装饰器转换错误：不要直接从根目录执行裸 `tsx`，使用 `pnpm api:dev`，该脚本
  会加载 `apps/api/tsconfig.json`。
- 本阶段分析器只做确定性静态分析，不会调用 AI 模型。

结束后可执行：

```powershell
pnpm infra:down
```
