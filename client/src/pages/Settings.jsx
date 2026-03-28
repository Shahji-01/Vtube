import { useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import api from '../api/axios'
import Avatar from '../components/Avatar'
import Spinner from '../components/Spinner'

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

export default function Settings() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  
  const [profileForm, setProfileForm] = useState({ fullName: user?.fullName || '', email: user?.email || '' })
  const [passForm, setPassForm]       = useState({ oldPassword: '', newPassword: '' })
  
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [loadingPass, setLoadingPass]       = useState(false)
  
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [coverUploading, setCoverUploading]   = useState(false)

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    if (!profileForm.fullName.trim() || !profileForm.email.trim()) {
      return toast({ message: 'Name and email required', type: 'error' })
    }
    setLoadingProfile(true)
    try {
      const { data } = await api.patch('/users/update-account', profileForm)
      setUser(data.data) // Assuming backend returns updated user
      toast({ message: 'Profile updated successfully!', type: 'success' })
    } catch (err) {
      toast({ message: err?.response?.data?.message || 'Update failed', type: 'error' })
    } finally {
      setLoadingProfile(false)
    }
  }

  const handlePasswordUpdate = async (e) => {
    e.preventDefault()
    if (!passForm.oldPassword || !passForm.newPassword) {
      return toast({ message: 'Both password fields required', type: 'error' })
    }
    setLoadingPass(true)
    try {
      await api.post('/users/change-password', passForm)
      setPassForm({ oldPassword: '', newPassword: '' })
      toast({ message: 'Password changed successfully!', type: 'success' })
    } catch (err) {
      toast({ message: err?.response?.data?.message || 'Password update failed', type: 'error' })
    } finally {
      setLoadingPass(false)
    }
  }

  const uploadFile = async (endpoint, formDataKey, file, setLoader) => {
    if (!file) return
    setLoader(true)
    try {
      const fd = new FormData()
      fd.append(formDataKey, file)
      const { data } = await api.patch(`/users/${endpoint}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUser(data.data)
      toast({ message: 'Image updated successfully!', type: 'success' })
    } catch (err) {
      toast({ message: err?.response?.data?.message || 'Upload failed', type: 'error' })
    } finally {
      setLoader(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Manage your channel identity and account settings</p>
      </div>

      <div style={{ maxWidth: 800, margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 32 }}>
        
        {/* Visual Identity Section */}
        <section className="setting-section">
          <h2>Channel Appearance</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
            
            {/* Cover Upload */}
            <div>
              <p style={{ fontWeight: 500, marginBottom: 12 }}>Cover Banner</p>
              <div 
                className="channel-cover" 
                style={{ position: 'relative', cursor: 'pointer', overflow: 'hidden', height: 180 }}
              >
                {user?.coverImage ? <img src={user.coverImage} alt="Cover" /> : <div className="channel-cover-placeholder" />}
                
                <label style={{ 
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'white', opacity: coverUploading ? 1 : 0.8
                }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    onChange={(e) => uploadFile('cover-image', 'coverImage', e.target.files[0], setCoverUploading)}
                    disabled={coverUploading}
                  />
                  {coverUploading ? <Spinner /> : <><CameraIcon /> <span style={{ marginLeft: 8 }}>Change Cover</span></>}
                </label>
              </div>
            </div>

            {/* Avatar Upload */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ position: 'relative', width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                {user?.avatar && <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Avatar" />}
                <label style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'white', opacity: avatarUploading ? 1 : 0
                }} className="avatar-hover-layer">
                  <input 
                    type="file" 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    onChange={(e) => uploadFile('avatar', 'avatar', e.target.files[0], setAvatarUploading)}
                    disabled={avatarUploading}
                  />
                  {avatarUploading ? <Spinner /> : <CameraIcon />}
                </label>
              </div>
              <div>
                <h3 style={{ fontSize: 18 }}>Profile Picture</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                  JPG, JPEG, or PNG formats only. 
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* Profile Details Form */}
        <section className="setting-section">
          <h2>Account Details</h2>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }} onSubmit={handleProfileUpdate}>
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input 
                className="input" 
                value={profileForm.fullName}
                onChange={e => setProfileForm(f => ({ ...f, fullName: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input 
                type="email"
                className="input" 
                value={profileForm.email}
                onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={loadingProfile}>
                {loadingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* Password Form */}
        <section className="setting-section">
          <h2>Security</h2>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }} onSubmit={handlePasswordUpdate}>
            <div className="input-group">
              <label className="input-label">Current Password</label>
              <input 
                type="password"
                className="input" 
                placeholder="Enter current password"
                value={passForm.oldPassword}
                onChange={e => setPassForm(f => ({ ...f, oldPassword: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label className="input-label">New Password</label>
              <input 
                type="password"
                className="input" 
                placeholder="Enter new password"
                value={passForm.newPassword}
                onChange={e => setPassForm(f => ({ ...f, newPassword: e.target.value }))}
              />
            </div>
            <div>
              <button type="submit" className="btn btn-secondary" disabled={loadingPass}>
                {loadingPass ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </section>

      </div>

      <style>{`
        .setting-section {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
        }
        .setting-section h2 {
          font-size: 18px;
          font-weight: 600;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        .avatar-hover-layer {
          transition: opacity 0.2s ease;
        }
        .avatar-hover-layer:hover {
          opacity: 1 !important;
        }
      `}</style>
    </>
  )
}
