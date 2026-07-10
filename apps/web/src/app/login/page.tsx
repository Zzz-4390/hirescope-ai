import { LoginForm } from "../../components/LoginForm";
import { SiteHeader } from "../../components/SiteHeader";

export default function LoginPage() {
  return (
    <div className="login-page">
      <SiteHeader current="login" />
      <main className="login-main">
        <h1>现在登录，让面试准备更高效。</h1>
        <LoginForm />
      </main>
      <footer className="login-footer">
        <span>© 2026 码途 AI（HireScope AI）保留所有权利</span>
        <div><span>关于我们</span><span>隐私政策</span><span>服务条款</span></div>
      </footer>
    </div>
  );
}
