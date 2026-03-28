export default function Spinner({ size = 'sm' }) {
  return <div className={`spinner ${size === 'lg' ? 'spinner-lg' : ''}`} />
}
