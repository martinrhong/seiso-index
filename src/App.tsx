import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

type User = {
  id: string
  username: string
  color: string | null
  avatar_path: string | null
}

type Placement = {
  x: number
  y: number
}

type Tab = 'chart' | 'analysis'

function App() {
  const [users, setUsers] = useState<User[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('chart')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [placements, setPlacements] = useState<Record<string, Placement>>({})
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null)

  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    async function loadUsers() {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, color, avatar_path')
        .order('username')

      if (error) {
        setError(error.message)
        return
      }

      setUsers(data ?? [])
    }

    loadUsers()
  }, [])

  useEffect(() => {
    function handlePointerUp(event: PointerEvent) {
      if (!draggingUserId || !chartRef.current) {
        return
      }

      const chart = chartRef.current
      const rect = chart.getBoundingClientRect()

      const insideChart =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (insideChart) {
        const horizontalPercent =
          (event.clientX - rect.left) / rect.width

        const verticalPercent =
          (event.clientY - rect.top) / rect.height

        const x = horizontalPercent * 200 - 100
        const y = 100 - verticalPercent * 200

        setPlacements((current) => ({
          ...current,
          [draggingUserId]: {
            x,
            y,
          },
        }))
      }

      setDraggingUserId(null)
    }

    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingUserId])

  return (
    <main className="app">
      <header className="header">
        <p className="eyebrow">
          Ayano/Hana/Toshi Server Collaboration
        </p>
        <h1>Seiso Index</h1>

        <div className="tabs">
          <button
            className={activeTab === 'chart' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('chart')}
          >
            My Chart
          </button>

          <button
            className={activeTab === 'analysis' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('analysis')}
          >
            Analysis
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {activeTab === 'chart' && (
        <>
          <section className="user-strip">
            {users.map((user) => (
              <button
                key={user.id}
                className={
                  selectedUserId === user.id
                    ? 'user-card selected'
                    : 'user-card'
                }
                onClick={() => setSelectedUserId(user.id)}
              >
                <div
                  className="avatar-placeholder"
                  style={{
                    backgroundColor: user.color ?? undefined,
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    setSelectedUserId(user.id)
                    setDraggingUserId(user.id)
                  }}
                >
                  {user.username.slice(0, 1).toUpperCase()}
                </div>

                <span>{user.username}</span>
              </button>
            ))}
          </section>

          <section className="chart-wrapper">
            <div className="chart-label top">Is Seiso</div>
            <div className="chart-label left">Acts Yabai</div>
            <div className="chart-label right">Acts Seiso</div>
            <div className="chart-label bottom">Is Yabai</div>

            <div
              ref={chartRef}
              className={
                draggingUserId
                  ? 'alignment-chart alignment-chart--dragging'
                  : 'alignment-chart'
              }
            >
              <div className="axis vertical" />
              <div className="axis horizontal" />

              {users.map((user) => {
                const placement = placements[user.id]

                if (!placement) {
                  return null
                }

                return (
                  <button
                    key={user.id}
                    type="button"
                    className="placed-user"
                    style={{
                      left: `${(placement.x + 100) / 2}%`,
                      top: `${(100 - placement.y) / 2}%`,
                    }}
                    onClick={() => setSelectedUserId(user.id)}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      setSelectedUserId(user.id)
                      setDraggingUserId(user.id)
                    }}
                    title={`${user.username}: ${placement.x.toFixed(0)}, ${placement.y.toFixed(0)}`}
                  >
                    <div
                      className="placed-avatar"
                      style={{
                        backgroundColor: user.color ?? undefined,
                      }}
                    >
                      {user.username.slice(0, 1).toUpperCase()}
                    </div>

                    <span>{user.username}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}

      {activeTab === 'analysis' && (
        <section className="analysis-placeholder">
          <h2>Analysis</h2>
          <p>Coming next.</p>
        </section>
      )}
    </main>
  )
}

export default App