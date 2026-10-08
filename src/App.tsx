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

type DragPreview = {
  clientX: number
  clientY: number
}

type DragOrigin = 'strip' | 'chart'

type OverlapMenu = {
  clientX: number
  clientY: number
  userIds: string[]
}

type Tab = 'chart' | 'analysis'

const TAP_DISTANCE_PX = 7
const OVERLAP_DISTANCE_PX = 36

function App() {
  const [users, setUsers] = useState<User[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('chart')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [placements, setPlacements] = useState<Record<string, Placement>>({})
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [overlapMenu, setOverlapMenu] = useState<OverlapMenu | null>(null)
  const [isInfoOpen, setIsInfoOpen] = useState(false)

  const chartRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<DragPreview | null>(null)
  const dragOriginRef = useRef<DragOrigin | null>(null)

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
    function getNearbyPlacedUsers(
      clientX: number,
      clientY: number,
      rect: DOMRect,
    ) {
      return users
        .filter((user) => placements[user.id])
        .map((user) => {
          const placement = placements[user.id]

          const pointX =
            rect.left +
            ((placement.x + 100) / 200) * rect.width

          const pointY =
            rect.top +
            ((100 - placement.y) / 200) * rect.height

          const distance = Math.hypot(
            clientX - pointX,
            clientY - pointY,
          )

          return {
            userId: user.id,
            distance,
          }
        })
        .filter((item) => item.distance <= OVERLAP_DISTANCE_PX)
        .sort((a, b) => a.distance - b.distance)
        .map((item) => item.userId)
    }

    function finishDrag() {
      setDraggingUserId(null)
      setDragPreview(null)
      dragStartRef.current = null
      dragOriginRef.current = null
    }

    function handlePointerMove(event: PointerEvent) {
      if (!draggingUserId) {
        return
      }

      setDragPreview({
        clientX: event.clientX,
        clientY: event.clientY,
      })
    }

    function handlePointerUp(event: PointerEvent) {
      if (!draggingUserId || !chartRef.current) {
        finishDrag()
        return
      }

      const chart = chartRef.current
      const rect = chart.getBoundingClientRect()
      const start = dragStartRef.current

      const movedDistance = start
        ? Math.hypot(
            event.clientX - start.clientX,
            event.clientY - start.clientY,
          )
        : 0

      const wasTap =
        dragOriginRef.current === 'chart' &&
        movedDistance <= TAP_DISTANCE_PX

      if (wasTap) {
        const nearbyUserIds = getNearbyPlacedUsers(
          event.clientX,
          event.clientY,
          rect,
        )

        if (nearbyUserIds.length > 1) {
          setOverlapMenu({
            clientX: event.clientX,
            clientY: event.clientY,
            userIds: nearbyUserIds,
          })
        } else {
          setSelectedUserId(
            nearbyUserIds[0] ?? draggingUserId,
          )
          setOverlapMenu(null)
        }

        finishDrag()
        return
      }

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

        setSelectedUserId(draggingUserId)
        setOverlapMenu(null)
      }

      finishDrag()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingUserId, placements, users])

  const unplacedUsers = users.filter(
    (user) => !placements[user.id],
  )

  const selectedUser = users.find(
    (user) => user.id === selectedUserId,
  )

  const selectedPlacement = selectedUserId
    ? placements[selectedUserId]
    : undefined

  function startDrag(
    event: React.PointerEvent,
    userId: string,
    origin: DragOrigin,
  ) {
    event.preventDefault()
    event.stopPropagation()

    setSelectedUserId(userId)
    setDraggingUserId(userId)
    setOverlapMenu(null)

    const startPoint = {
      clientX: event.clientX,
      clientY: event.clientY,
    }

    dragStartRef.current = startPoint
    dragOriginRef.current = origin
    setDragPreview(startPoint)
  }

  function removeSelectedPlacement() {
    if (!selectedUserId || !placements[selectedUserId]) {
      return
    }

    setPlacements((current) => {
      const next = { ...current }
      delete next[selectedUserId]
      return next
    })

    setOverlapMenu(null)
  }

  return (
    <main className="app">
      <header className="header">
        <div className="header-title-row">
          <div>
            <p className="eyebrow">
              Ayano/Hana/Toshi Server Collaboration
            </p>
            <h1>Seiso Index</h1>
          </div>

          <button
            type="button"
            className="info-button"
            aria-label="How to use Seiso Index"
            title="How to use Seiso Index"
            onClick={() => setIsInfoOpen(true)}
          >
            ?
          </button>
        </div>

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
            {unplacedUsers.length > 0 ? (
              unplacedUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
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
                    onPointerDown={(event) =>
                      startDrag(event, user.id, 'strip')
                    }
                  >
                    {user.username.slice(0, 1).toUpperCase()}
                  </div>

                  <span>{user.username}</span>
                </button>
              ))
            ) : (
              <p className="user-strip-empty">
                Everyone has been placed.
              </p>
            )}
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
              onPointerDown={() => setOverlapMenu(null)}
            >
              <div className="axis vertical" />
              <div className="axis horizontal" />

              {users.map((user) => {
                const placement = placements[user.id]

                if (!placement) {
                  return null
                }

                const isSelected =
                  selectedUserId === user.id

                return (
                  <button
                    key={user.id}
                    type="button"
                    className={
                      isSelected
                        ? 'placed-user placed-user--selected'
                        : 'placed-user'
                    }
                    style={{
                      left: `${(placement.x + 100) / 2}%`,
                      top: `${(100 - placement.y) / 2}%`,
                    }}
                    onPointerDown={(event) =>
                      startDrag(event, user.id, 'chart')
                    }
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

          {selectedUser && selectedPlacement && (
            <div className="placement-actions">
              <span>
                Selected: <strong>{selectedUser.username}</strong>
              </span>

              <button
                type="button"
                className="remove-placement-button"
                onClick={removeSelectedPlacement}
              >
                Remove placement
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'analysis' && (
        <section className="analysis-placeholder">
          <h2>Analysis</h2>
          <p>Coming next.</p>
        </section>
      )}

      {draggingUserId && dragPreview && (() => {
        const user = users.find(
          (user) => user.id === draggingUserId,
        )

        if (!user) {
          return null
        }

        return (
          <div
            className="drag-preview"
            style={{
              left: dragPreview.clientX,
              top: dragPreview.clientY,
            }}
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
          </div>
        )
      })()}

      {overlapMenu && (
        <div
          className="overlap-menu"
          style={{
            left: overlapMenu.clientX,
            top: overlapMenu.clientY,
          }}
        >
          <p>People here</p>

          {overlapMenu.userIds.map((userId) => {
            const user = users.find(
              (candidate) => candidate.id === userId,
            )

            if (!user) {
              return null
            }

            return (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  setSelectedUserId(user.id)
                  setOverlapMenu(null)
                }}
              >
                <span
                  className="overlap-dot"
                  style={{
                    backgroundColor:
                      user.color ?? undefined,
                  }}
                />
                {user.username}
              </button>
            )
          })}
        </div>
      )}

      {isInfoOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onPointerDown={() => setIsInfoOpen(false)}
        >
          <section
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-modal-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="info-modal-header">
              <div>
                <p className="eyebrow">Seiso Index</p>
                <h2 id="info-modal-title">How to use it</h2>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label="Close information"
                onClick={() => setIsInfoOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="info-modal-content">
              <p>
                Drag each person from the row at the top onto the
                chart. Once placed, they disappear from that row.
              </p>

              <div className="info-axis-grid">
                <div>
                  <strong>Top</strong>
                  <span>Is Seiso</span>
                </div>
                <div>
                  <strong>Bottom</strong>
                  <span>Is Yabai</span>
                </div>
                <div>
                  <strong>Left</strong>
                  <span>Acts Yabai</span>
                </div>
                <div>
                  <strong>Right</strong>
                  <span>Acts Seiso</span>
                </div>
              </div>

              <p>
                To change someone&apos;s rating, drag their avatar
                directly on the chart. The currently selected person
                is outlined in blue.
              </p>

              <p>
                If several people are on top of each other, tap the
                group and choose the person you want from the
                <strong> People here</strong> menu.
              </p>

              <p>
                Use <strong>Remove placement</strong> to return the
                selected person to the unplaced row.
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
