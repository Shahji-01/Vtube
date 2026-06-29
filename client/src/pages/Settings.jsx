import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import api from '../api/axios'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import Avatar from '../components/ui/Avatar'
import styles from './Settings.module.css'

const CameraIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

export default function Settings() {
  const { user, setUser } = useAuth()
  const toast = useToast()

  const [profileForm, setProfileForm] = useState({ fullName: user?.fullName || '', email: user?.email || '' })
  const [passForm, setPassForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })

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
    if (!passForm.oldPassword || !passForm.newPassword || !passForm.confirmPassword) {
      return toast({ message: 'All password fields are required', type: 'error' })
    }
    if (passForm.newPassword !== passForm.confirmPassword) {
      return toast({ message: 'New passwords do not match', type: 'error' })
    }
    setLoadingPass(true)
    try {
      await api.post('/users/change-password', passForm)
      setPassForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
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
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Manage your channel identity and account settings</p>
      </div>

      <div className={styles.sections}>

        {/* Visual Identity Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Channel Appearance</h2>
          <div className={styles.appearanceBody}>

            {/* Cover Upload */}
            <div>
              <p className={styles.fieldLabel}>Cover Banner</p>
              <div className={styles.cover}>
                {user?.coverImage
                  ? <img className={styles.coverImg} src={user.coverImage} alt="Cover" />
                  : <div className={styles.coverPlaceholder} />}

                <label className={`${styles.overlay} ${styles.coverOverlay} ${coverUploading ? styles.overlayActive : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => uploadFile('cover-image', 'coverImage', e.target.files[0], setCoverUploading)}
                    disabled={coverUploading}
                  />
                  {coverUploading ? <Spinner /> : <><CameraIcon /> <span className={styles.overlayText}>Change Cover</span></>}
                </label>
              </div>
            </div>

            {/* Avatar Upload */}
            <div className={styles.avatarRow}>
              <div className={styles.avatarWrap}>
                <Avatar src={user?.avatar} name={user?.fullName} size={100} />
                <label className={`${styles.overlay} ${styles.avatarOverlay} ${avatarUploading ? styles.overlayActive : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => uploadFile('avatar', 'avatar', e.target.files[0], setAvatarUploading)}
                    disabled={avatarUploading}
                  />
                  {avatarUploading ? <Spinner /> : <CameraIcon />}
                </label>
              </div>
              <div>
                <h3 className={styles.avatarTitle}>Profile Picture</h3>
                <p className={styles.avatarHint}>
                  JPG, JPEG, or PNG formats only.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* Profile Details Form */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Account Details</h2>
          <form className={styles.form} onSubmit={handleProfileUpdate}>
            <Input
              label="Full Name"
              value={profileForm.fullName}
              onChange={e => setProfileForm(f => ({ ...f, fullName: e.target.value }))}
            />
            <Input
              label="Email Address"
              type="email"
              value={profileForm.email}
              onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" loading={loadingProfile}>
                {loadingProfile ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </form>
        </section>

        {/* Password Form */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Security</h2>
          <form className={styles.form} onSubmit={handlePasswordUpdate}>
            <Input
              label="Current Password"
              type="password"
              placeholder="Enter current password"
              value={passForm.oldPassword}
              onChange={e => setPassForm(f => ({ ...f, oldPassword: e.target.value }))}
            />
            <Input
              label="New Password"
              type="password"
              placeholder="Enter new password"
              value={passForm.newPassword}
              onChange={e => setPassForm(f => ({ ...f, newPassword: e.target.value }))}
            />
            <Input
              label="Confirm New Password"
              type="password"
              placeholder="Confirm new password"
              value={passForm.confirmPassword}
              onChange={e => setPassForm(f => ({ ...f, confirmPassword: e.target.value }))}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="secondary" loading={loadingPass}>
                {loadingPass ? 'Changing...' : 'Change Password'}
              </Button>
            </div>
          </form>
        </section>

      </div>
    </>
  )
}
