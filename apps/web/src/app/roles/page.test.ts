import { readFileSync } from "node:fs"; import { join } from "node:path"; import { describe,expect,it } from "vitest";
describe("role entry page",()=>{
  it("contains the role selection and comparison experience",()=>{const page=readFileSync(join(process.cwd(),"src/app/roles/page.tsx"),"utf8");["选择你的角色","开启专属体验","三类角色入口","求职者 / 学生","面试官 / 评审者","管理员 / 平台方","角色能力对比"].forEach(text=>expect(page).toContain(text));});
  it("uses scoped reveal motion",()=>{const page=readFileSync(join(process.cwd(),"src/app/roles/page.tsx"),"utf8");const css=readFileSync(join(process.cwd(),"src/app/globals.css"),"utf8");expect(page).toContain("<RoleRevealManager");expect(css).toContain('.role-entry-page[data-role-reveal-ready="true"]');expect(css).not.toMatch(/\.role-entry-page\{[^}]*scroll-snap-type/);});
});
