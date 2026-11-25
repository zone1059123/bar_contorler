import {LockKeyhole, Wine} from 'lucide-react'
import {Field,Form} from './ui'
import {responseData} from './client'

export function Login({onLogin}:{onLogin:()=>void}) {
  return <section className="login-layout" aria-labelledby="login-heading">
    <div className="login-brand"><Wine size={28}/><strong>BARKEEP</strong></div>
    <div className="panel login-card">
      <div className="metric-icon mint"><LockKeyhole size={23}/></div>
      <h1 id="login-heading">登入正式庫存</h1>
      <p>輸入工作區密碼，即可在手機和電腦上查看同一份庫存。</p>
      <Form label="登入" onDone={onLogin} onSubmit={async data=>{
        await responseData(await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:String(data.get('password')??'')})}))
      }}>
        <Field label="工作區密碼"><input name="password" type="password" autoComplete="current-password" maxLength={512} required autoFocus/></Field>
      </Form>
    </div>
  </section>
}
