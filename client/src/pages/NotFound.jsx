import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import styles from './NotFound.module.css'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className={styles.container}>
      <div className={styles.code}>404</div>
      <h1 className={styles.title}>Page Not Found</h1>
      <p className={styles.message}>
        This page doesn&apos;t exist or was removed. Let&apos;s get you back to something great.
      </p>
      <Button
        variant="primary"
        size="lg"
        iconLeft={<span aria-hidden="true">←</span>}
        onClick={() => navigate('/')}
      >
        Back to Home
      </Button>
    </div>
  )
}
