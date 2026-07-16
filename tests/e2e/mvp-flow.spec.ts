import { expect, request as requestFactory, test, type Page, type Response } from "@playwright/test";
import { InterviewStatus, PrismaClient, TaskStatus, TaskType } from "@prisma/client";
import { ZipFile } from "yazl";

const prisma = new PrismaClient();
const username = "playwright_mvp_user";
const email = "playwright-mvp@playwright.hirescope.test";
const password = "StrongPassword123!";
const projectName = "Playwright MVP 主流程";

test.afterEach(async () => {
  await prisma.user.deleteMany({ where: { email } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("MVP 主流程可恢复、可重试且跨会话持久化", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/register");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("电子邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  const registerResponse = await clickAndWaitForApi(page, "POST", "/api/v1/auth/register", () =>
    page.getByRole("button", { name: "注册", exact: true }).click(),
  );
  expect(registerResponse.status()).toBe(202);
  await expect(page).toHaveURL(/\/login$/);

  await login(page);
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/projects/new");
  await page.locator("#project-name").fill(projectName);
  await page.locator('input[type="file"]').setInputFiles({
    name: "playwright-mvp.zip",
    mimeType: "application/zip",
    buffer: await createProjectArchive(),
  });
  const uploadResponse = await clickAndWaitForApi(page, "POST", "/api/v1/projects", () =>
    page.getByRole("button", { name: "上传并开始分析" }).click(),
  );
  expect(uploadResponse.status()).toBe(202);
  const upload = await uploadResponse.json() as { project: { id: string }; task: { id: string } };
  const projectId = upload.project.id;

  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}$`));
  await expect.poll(() => apiStatus(page, `/projects/${projectId}`), { timeout: 90_000 }).toBe("COMPLETED");
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/app/projects/${projectId}$`));
  await expect(page.getByText("项目分析已完成，可继续代码审查或模拟面试。", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "代码审查" })).toBeEnabled();
  await expect(page.locator(".project-status-card.processing, .project-status-card.analyzing")).toHaveCount(0);

  await page.getByRole("link", { name: "代码审查" }).click();
  const createReviewResponse = await clickAndWaitForApi(page, "POST", `/api/v1/projects/${projectId}/code-reviews`, () =>
    page.getByRole("button", { name: "开始代码审查" }).click(),
  );
  expect(createReviewResponse.status()).toBe(202);
  const review = await createReviewResponse.json() as { id: string };
  await expect.poll(() => apiStatus(page, `/code-reviews/${review.id}`), { timeout: 90_000 }).toBe("SUCCEEDED");
  await page.reload();
  await expect(page.getByText("代码审查已完成", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看审查结果" })).toBeVisible();
  await expect(page.locator(".review-workbench.is-scanning")).toHaveCount(0);

  await page.goto(`/app/projects/${projectId}/interviews`);
  const createInterviewResponse = await clickAndWaitForApi(page, "POST", `/api/v1/projects/${projectId}/interviews`, () =>
    page.getByRole("button", { name: "创建面试" }).click(),
  );
  expect(createInterviewResponse.status()).toBe(202);
  const createdInterview = await createInterviewResponse.json() as { id: string };
  const interviewId = createdInterview.id;
  await expect.poll(() => apiStatus(page, `/interviews/${interviewId}`), { timeout: 90_000 }).toBe("READY");
  await page.reload();
  await expect(page.getByRole("link", { name: "开始面试" })).toBeVisible();
  await expect(page.getByText("生成题目中", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "开始面试" }).click();
  const startResponse = await clickAndWaitForApi(page, "POST", `/api/v1/interviews/${interviewId}/start`, () =>
    page.getByRole("button", { name: "开始面试" }).click(),
  );
  expect(startResponse.status()).toBe(201);

  for (let sequence = 1; sequence <= 5; sequence += 1) {
    const answer = `第 ${sequence} 题的浏览器端到端回答，包含项目实现、边界处理和测试验证。`;
    await page.getByLabel("你的回答").fill(answer);
    if (sequence < 5) {
      const saveResponse = await clickAndWaitForApi(page, "PUT", new RegExp(`/api/v1/interviews/${interviewId}/answers/`), () =>
        page.getByRole("button", { name: "下一题" }).click(),
      );
      expect(saveResponse.status()).toBe(200);
      await expect(page.getByText(`第 ${sequence + 1} / 5 题`, { exact: true })).toBeVisible();
    }
  }

  const submitResponse = await clickAndWaitForApi(page, "POST", `/api/v1/interviews/${interviewId}/submit`, () =>
    page.getByRole("button", { name: "检查并提交" }).click(),
  );
  expect(submitResponse.status()).toBe(201);
  await expect(page).toHaveURL(new RegExp(`/app/interviews/${interviewId}/report$`));

  const createReportResponse = await clickAndWaitForApi(page, "POST", `/api/v1/interviews/${interviewId}/report`, () =>
    page.getByRole("button", { name: "生成报告" }).click(),
  );
  expect(createReportResponse.status()).toBe(202);
  await expect.poll(() => apiStatus(page, `/interviews/${interviewId}`), { timeout: 90_000 }).toBe("COMPLETED");
  await page.reload();
  await expect(page.locator(".report-status")).toHaveText("报告已完成");
  await expect(page.locator(".report-generating-panel")).toHaveCount(0);

  await installScreenshotStyles(page);
  await setTheme(page, "light");
  await expect(page.locator(".report-overview-panel")).toHaveScreenshot("interview-report-light.png");
  await setTheme(page, "dark");
  await expect(page.locator(".report-overview-panel")).toHaveScreenshot("interview-report-dark.png");

  await seedFailedReportState(interviewId);
  await page.reload();
  await installScreenshotStyles(page);
  await setTheme(page, "light");
  await expect(page.getByRole("heading", { name: "报告暂不可用" })).toBeVisible();
  const retryButton = page.getByRole("button", { name: "重新生成报告" });
  await expect(retryButton).toBeVisible();
  await expect(page.locator(".interview-report-error-panel")).toHaveScreenshot("interview-report-retry-failed.png");
  const retryResponse = await clickAndWaitForApi(page, "POST", `/api/v1/interviews/${interviewId}/report`, () => retryButton.click());
  expect(retryResponse.status()).toBe(202);
  await expect.poll(() => apiStatus(page, `/interviews/${interviewId}`), { timeout: 90_000 }).toBe("COMPLETED");
  await page.reload();
  await expect(page.locator(".report-status")).toHaveText("报告已完成");
  await expect(page.locator(".report-generating-panel")).toHaveCount(0);
  await installScreenshotStyles(page);
  await expect(page.locator(".report-overview-panel")).toHaveScreenshot("interview-report-light.png");

  const refreshCookie = (await context.cookies(`${baseURL}/api/v1/auth/refresh`))
    .find((cookie) => cookie.name === "hirescope_e2e_refresh");
  expect(refreshCookie).toBeTruthy();
  const logoutResponse = await clickAndWaitForApi(page, "POST", "/api/v1/auth/logout", async () => {
    await page.getByRole("button", { name: `${username}的用户菜单` }).hover();
    await expect(page.getByRole("menu", { name: "用户菜单" })).toBeVisible();
    await page.getByRole("menuitem", { name: "退出登录" }).click();
  });
  expect(logoutResponse.status()).toBe(204);
  expect((await logoutResponse.allHeaders())["set-cookie"]).toContain("Expires=Thu, 01 Jan 1970");
  await expect(page).toHaveURL(`${baseURL}/`);
  expect((await context.cookies(`${baseURL}/api/v1/auth/refresh`)).some((cookie) => cookie.name === "hirescope_e2e_refresh")).toBe(false);

  const staleSession = await requestFactory.newContext({
    baseURL,
    extraHTTPHeaders: {
      Origin: baseURL,
      Cookie: `${refreshCookie!.name}=${refreshCookie!.value}`,
    },
  });
  const staleRefresh = await staleSession.post("/api/v1/auth/refresh");
  expect(staleRefresh.status()).toBe(401);
  await staleSession.dispose();

  await page.goto("/login");
  await login(page);
  await page.goto("/app/projects");
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();
  await page.goto(`/app/projects/${projectId}/review`);
  await expect(page.getByText("代码审查已完成", { exact: true })).toBeVisible();
  await page.goto(`/app/projects/${projectId}/interviews`);
  await expect(page.locator(".interview-history-list article").filter({ hasText: "已完成" })).toHaveCount(1);
  await page.goto(`/app/interviews/${interviewId}/report`);
  await expect(page.locator(".report-status")).toHaveText("报告已完成");

  await expectDatabaseInvariants(projectId, interviewId);
  expect(browserErrors).toEqual([]);
});

async function login(page: Page) {
  await page.getByLabel("用户名或邮箱").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  const response = await clickAndWaitForApi(page, "POST", "/api/v1/auth/login", () =>
    page.getByRole("button", { name: "登录", exact: true }).click(),
  );
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/app$/);
}

async function clickAndWaitForApi(
  page: Page,
  method: string,
  path: string | RegExp,
  action: () => Promise<unknown>,
): Promise<Response> {
  const responsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== method) return false;
    const pathname = new URL(response.url()).pathname;
    return typeof path === "string" ? pathname === path : path.test(pathname);
  });
  await action();
  return responsePromise;
}

async function apiStatus(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate(async (apiPath) => {
    const token = window.localStorage.getItem("hirescope.accessToken");
    const response = await fetch(`/api/v1${apiPath}`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { status?: string };
    return body.status;
  }, path);
}

async function createProjectArchive(): Promise<Buffer> {
  const archive = new ZipFile();
  archive.addBuffer(Buffer.from(JSON.stringify({ name: "playwright-fixture", version: "1.0.0", scripts: { test: "vitest" }, dependencies: { typescript: "5.9.3" } }, null, 2)), "playwright-fixture/package.json");
  archive.addBuffer(Buffer.from("export function normalizeCandidateScore(score: number) { return Math.max(0, Math.min(100, score)); }\n"), "playwright-fixture/src/score.ts");
  archive.addBuffer(Buffer.from("import { normalizeCandidateScore } from './score';\nconsole.log(normalizeCandidateScore(88));\n"), "playwright-fixture/src/index.ts");
  archive.end();

  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
    window.localStorage.setItem("hirescope-theme", value);
  }, theme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function installScreenshotStyles(page: Page) {
  await page.addStyleTag({
    content: ".report-overview-panel{height:192px!important}.interview-report-error-panel{height:220px!important}",
  });
}

async function seedFailedReportState(interviewId: string) {
  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId }, select: { userId: true, projectId: true } });
  await prisma.$transaction([
    prisma.interviewReport.deleteMany({ where: { interviewId } }),
    prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: InterviewStatus.FAILED,
        failureCode: "E2E_PERSISTED_REPORT_FAILURE",
        failureMessage: "用于验证持久化失败状态的测试夹具",
        completedAt: new Date(),
      },
    }),
    prisma.asyncTask.create({
      data: {
        userId: interview.userId,
        projectId: interview.projectId,
        interviewId,
        type: TaskType.INTERVIEW_REPORT_GENERATION,
        status: TaskStatus.FAILED,
        progress: 100,
        attempts: 1,
        failureCode: "E2E_PERSISTED_REPORT_FAILURE",
        failureMessage: "用于验证持久化失败状态的测试夹具",
        completedAt: new Date(),
      },
    }),
  ]);
}

async function expectDatabaseInvariants(projectId: string, interviewId: string) {
  const [activeTasks, reports, reviews, interviews] = await Promise.all([
    prisma.asyncTask.count({
      where: {
        projectId,
        status: { in: [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.PROCESSING] },
      },
    }),
    prisma.interviewReport.count({ where: { interviewId } }),
    prisma.codeReview.count({ where: { projectId } }),
    prisma.interview.count({ where: { projectId } }),
  ]);
  expect(activeTasks).toBe(0);
  expect(reports).toBe(1);
  expect(reviews).toBe(1);
  expect(interviews).toBe(1);
}
