import { useEffect, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { getSavedTheme, setTheme, setAvatarUrl, clearAvatarUrl } from '../utils/theme'
import '../styles/Settings.css'

type Props = {
  user: { id: string; email?: string } | null
}

export default function Settings({ user }: Props) {
  const [loading, setLoading] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [theme, setThemeState] = useState(getSavedTheme())

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('username, avatar_url').eq('id', user.id).maybeSingle()
      if (!mounted) return
      if (data) {
        setUsername(data.username ?? '')
        if (data.avatar_url) setAvatarPreview(data.avatar_url)
      }
      setProfileLoaded(true)
    })().catch(() => setProfileLoaded(true))
    return () => { mounted = false }
  }, [user])

  // Keep local `theme` state in sync with global theme changes
  useEffect(() => {
    const onThemeChanged = (ev: Event) => {
      try {
        type ThemeDetail = { saved?: string; applied?: string }
        const ce = ev as CustomEvent<ThemeDetail>
        const saved = ce.detail?.saved
        const applied = ce.detail?.applied
        if (saved === 'light' || saved === 'dark' || saved === 'system') setThemeState(saved)
        else if (applied === 'light' || applied === 'dark') setThemeState(applied as 'light' | 'dark')
      } catch {
        // ignore
      }
    }
    document.addEventListener('app:theme-changed', onThemeChanged as EventListener)
    return () => document.removeEventListener('app:theme-changed', onThemeChanged as EventListener)
  }, [])

  if (!user) {
    return (
      <div className="settings-wrap">
        <h2>设置</h2>
        <section>
          <h3>主题</h3>
          <div className="segmented">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => { setTheme('light'); setThemeState('light') }}>亮色主题</button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => { setTheme('dark'); setThemeState('dark') }}>暗色主题</button>
            <button className={theme === 'system' ? 'active' : ''} onClick={() => { setTheme('system'); setThemeState('system') }}>跟随系统</button>
          </div>
        </section>
        <div className="muted"></div>
        <div className="auth-cta-wrap">
          <button className="auth-cta" onClick={() => document.dispatchEvent(new CustomEvent('app:open-auth'))}>登录 / 注册</button>
        </div>
      </div>
    )
  }

  const withBusy = async (fn: () => Promise<void>) => {
    setLoading(true)
    try { await fn() } finally { setLoading(false) }
  }

  const saveUsername = () => withBusy(async () => {
    const u = username.trim()
    const { error } = await supabase.from('profiles').upsert({ id: user.id, username: u, email: email.trim() || null }).select('id')
    if (error) return alert(error.message)
    const { error: mdErr } = await supabase.auth.updateUser({ data: { username: u } })
    if (mdErr) console.warn('update metadata error:', mdErr)
    alert('用户名已更新')
  })

  const saveEmail = () => withBusy(async () => {
    const e = email.trim()
    if (!/.+@.+\..+/.test(e)) return alert('请输入有效邮箱')
    const { error: emErr } = await supabase.auth.updateUser({ email: e })
    if (emErr) return alert(emErr.message)
    await supabase.from('profiles').upsert({ id: user.id, email: e }).select('id')
    alert('邮箱更新请求已提交，请查收确认邮件')
  })

  const savePassword = () => withBusy(async () => {
    const p = newPassword
    if (p.length < 6) return alert('密码长度至少 6 位')
    const { error } = await supabase.auth.updateUser({ password: p })
    if (error) return alert(error.message)
    setNewPassword('')
    alert('密码已更新')
  })

  const onUploadAvatar = async (file: File) => {
    if (!user) return
    await withBusy(async () => {
      const ext = file.name.split('.').pop() || 'png'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) return alert(upErr.message)
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = data?.publicUrl
      if (!publicUrl) return alert('获取头像 URL 失败')
      setAvatarPreview(publicUrl)
      const { error } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: publicUrl, email: email.trim() || null }).select('id')
      if (error) return alert(error.message)
      const { error: mdErr } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      if (mdErr) console.warn('update metadata error:', mdErr)
      // update sidebar avatar immediately
      setAvatarUrl(publicUrl)
      document.dispatchEvent(new CustomEvent('app:avatar-updated', { detail: { url: publicUrl } }))
      alert('头像已上传并设置')
    })
  }

  const logout = async () => {
    await withBusy(async () => {
      const { error } = await supabase.auth.signOut()
      if (error) alert(error.message)
      else {
        // clear local avatar cache so sidebar falls back to default
        clearAvatarUrl()
      }
    })
  }

  return (
    <div className="settings-wrap">
      <h2>设置</h2>
      {!profileLoaded && <div className="muted">加载中…</div>}

      {/* 1: Theme (always shown) */}
      <section>
        <h3>主题</h3>
        <div className="segmented">
          <button className={theme === 'light' ? 'active' : ''} onClick={() => { setTheme('light'); setThemeState('light') }}>亮色主题</button>
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => { setTheme('dark'); setThemeState('dark') }}>暗色主题</button>
          <button className={theme === 'system' ? 'active' : ''} onClick={() => { setTheme('system'); setThemeState('system') }}>跟随系统</button>
        </div>
      </section>

      {/* 2: Avatar (left) + Username/Email (right) in the same card */}
      <section className="profile-card">
        <div className="avatar-row">
          <div className="avatar-preview">
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar" />
            ) : (
              <div className="avatar-fallback">头像</div>
            )}
          </div>
          <div className="profile-forms">
            <div className="row">
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="新的用户名" />
              <button onClick={saveUsername} disabled={loading}>保存</button>
            </div>
            <div className="row">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="新的邮箱" autoComplete="off" />
              <button onClick={saveEmail} disabled={loading}>保存</button>
            </div>
            <div className="avatar-actions">
              <label className="upload-btn">
                <input type="file" accept="image/*" onChange={e => e.target.files && e.target.files[0] && onUploadAvatar(e.target.files[0])} />
                上传头像
              </label>
            </div>
            
          </div>
        </div>
      </section>

      {/* 3: Password (email-verified flow) */}
      <section>
        <h3>修改密码</h3>
        <div className="row">
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="新的密码（≥ 6 位）" autoComplete="new-password" />
          <button onClick={savePassword} disabled={loading || newPassword.length < 6}>保存</button>
        </div>
      </section>

      {/* 4: Logout button (no '账户' heading) */}
      <section className="logout-card">
        <button className="danger" onClick={logout} disabled={loading}>退出登录</button>
      </section>
    </div>
  )
}
