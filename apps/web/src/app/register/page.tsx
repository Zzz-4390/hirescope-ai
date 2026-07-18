import { RegisterForm } from "../../components/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="login-page">
      <main className="login-main">
        <h1>创建账户，开始分析你的项目能力。</h1>
        <RegisterForm />
      </main>
      <footer className="login-footer">
        <span>© 2026 码途 AI（HireScope AI）保留所有权利</span>
        <div><span>关于我们</span><span>隐私政策</span><span>服务条款</span></div>
      </footer>
    </div>
  );
}
