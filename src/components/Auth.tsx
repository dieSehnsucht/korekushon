import { useState } from 'react'
import { supabase, resolveEmailFromIdentifier } from '../supabase/supabaseClient'

type Props = { onClose: () => void; onAuthed: () => void; recovering?: boolean }

export default function Auth({ onClose, onAuthed, recovering }: Props) {
	const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'recover-set'>(
		recovering ? 'recover-set' : 'login'
	)
	const [identifier, setIdentifier] = useState('') // username or email
	const [username, setUsername] = useState('') // for signup
	const [password, setPassword] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState<string | null>(null)

	const doLogin = async () => {
		setLoading(true)
		const email = await resolveEmailFromIdentifier(identifier)
		if (!email) {
			setLoading(false)
			return setMessage('用户名或邮箱不存在')
		}
		const { error } = await supabase.auth.signInWithPassword({ email, password })
		setLoading(false)
		if (error) return setMessage(error.message)
		onAuthed()
	}

	const doSignup = async () => {
		setLoading(true)
		const emailOk = /.+@.+\..+/.test(identifier)
		if (!emailOk) {
			setLoading(false)
			return setMessage('请输入有效邮箱作为注册邮箱')
		}
		const { data, error } = await supabase.auth.signUp({ email: identifier, password, options: { data: { username } } })
		setLoading(false)
		if (error) return setMessage(error.message)
		if (data.user) setMessage('注册成功，已发送验证邮件，请前往邮箱验证后再登录')
	}

	const doReset = async () => {
		setLoading(true)
		const emailOk = /.+@.+\..+/.test(identifier)
		if (!emailOk) {
			setLoading(false)
			return setMessage('请输入有效邮箱以重置密码')
		}
		const { error } = await supabase.auth.resetPasswordForEmail(identifier, {
			redirectTo: window.location.origin,
		})
		setLoading(false)
		if (error) return setMessage(error.message)
		setMessage('已发送密码重置邮件，请前往邮箱操作')
	}

		const doRecoverSet = async () => {
			setLoading(true)
			const { error } = await supabase.auth.updateUser({ password: newPassword })
			setLoading(false)
			if (error) return setMessage(error.message)
			setMessage('密码已重置，请使用新密码登录')
			setMode('login')
		}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<div className="auth-tabs">
						<button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>登录</button>
						<button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>注册</button>
					</div>
					<button className="close" onClick={onClose}>×</button>
				</div>
				<div className="modal-body">
					{mode === 'signup' && (
						<div className="form-row">
							<label>用户名</label>
							<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
						</div>
					)}
								{(mode === 'login' || mode === 'signup' || mode === 'reset') && (
								<div className="form-row">
						<label>{mode === 'signup' ? '邮箱' : '用户名或邮箱'}</label>
						<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={mode === 'signup' ? '邮箱' : '用户名或邮箱'} />
								</div>
								)}
								{mode === 'login' || mode === 'signup' ? (
						<div className="form-row">
							<label>密码</label>
							<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
						</div>
								) : null}
								{mode === 'recover-set' && (
									<div className="form-row">
										<label>新密码</label>
										<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码" />
									</div>
								)}
					{mode === 'login' && (
						<div className="forgot-row">
							<button className="link" onClick={() => setMode('reset')}>忘记密码?</button>
						</div>
					)}
					{message && <div className="message">{message}</div>}
				</div>
				<div className="modal-footer">
					{mode === 'login' && (
						<button className="primary" disabled={loading} onClick={doLogin}>登录</button>
					)}
					{mode === 'signup' && (
						<button className="primary" disabled={loading} onClick={doSignup}>注册</button>
					)}
					{mode === 'reset' && (
						<button className="primary" disabled={loading} onClick={doReset}>发送重置邮件</button>
					)}
					{mode === 'recover-set' && (
						<button className="primary" disabled={loading || !newPassword} onClick={doRecoverSet}>设置新密码</button>
					)}
				</div>
			</div>
		</div>
	)
}

