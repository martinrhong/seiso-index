import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

type User = {
  id: string
  username: string
  timezone: string
  color: string | null
  avatar_path: string | null
}

type Placement = { x: number; y: number }
type DragPreview = { clientX: number; clientY: number; x: number | null; y: number | null }
type DragOrigin = 'strip' | 'chart'
type OverlapMenu = { clientX: number; clientY: number; userIds: string[] }
type RatingRow = { subject_user_id: string; x_score: number; y_score: number }
type Tab = 'chart' | 'analysis'
type ProfileMode = 'add' | 'edit'
type ImageSize = { width: number; height: number }

const LAST_RATER_STORAGE_KEY = 'seiso-index:last-rater-user-id'
const TAP_DISTANCE_PX = 7
const OVERLAP_DISTANCE_PX = 36
const CROP_SIZE = 220

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'
}

function isValidTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat('en-AU', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

function getAvatarUrl(path: string | null) {
  if (!path) return null
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

function getChartCoordinates(
  clientX: number,
  clientY: number,
  rect: DOMRect,
) {
  const insideChart =
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom

  if (!insideChart) {
    return { x: null, y: null }
  }

  return {
    x: Math.round(((clientX - rect.left) / rect.width) * 200 - 100),
    y: Math.round(100 - ((clientY - rect.top) / rect.height) * 200),
  }
}

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
  const [raterUserId, setRaterUserId] = useState<string | null>(null)
  const [isLoadingRatings, setIsLoadingRatings] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const [profileMode, setProfileMode] = useState<ProfileMode | null>(null)
  const [profileName, setProfileName] = useState('')
  const [profileTimezone, setProfileTimezone] = useState('')
  const [profileColor, setProfileColor] = useState('#3b82f6')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarSourceUrl, setAvatarSourceUrl] = useState<string | null>(null)
  const [avatarImageSize, setAvatarImageSize] = useState<ImageSize | null>(null)
  const [avatarZoom, setAvatarZoom] = useState(1)
  const [avatarOffset, setAvatarOffset] = useState({ x: 0, y: 0 })
  const [removeAvatar, setRemoveAvatar] = useState(false)

  const chartRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<DragPreview | null>(null)
  const dragOriginRef = useRef<DragOrigin | null>(null)
  const avatarDragStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null)

  const raterUser = users.find((user) => user.id === raterUserId) ?? null
  const editingUser = profileMode === 'edit' ? raterUser : null

  useEffect(() => {
    async function loadUsers() {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, timezone, color, avatar_path')
        .order('username')

      if (error) {
        setError(error.message)
        return
      }

      const loadedUsers = (data ?? []) as User[]
      setUsers(loadedUsers)

      const storedRaterUserId = localStorage.getItem(LAST_RATER_STORAGE_KEY)
      if (storedRaterUserId && loadedUsers.some((user) => user.id === storedRaterUserId)) {
        setRaterUserId(storedRaterUserId)
      }
    }

    loadUsers()
  }, [])

  useEffect(() => {
    async function loadRatings() {
      if (!raterUserId) {
        setPlacements({})
        setSelectedUserId(null)
        return
      }

      setIsLoadingRatings(true)
      setError(null)

      const { data, error } = await supabase
        .from('seiso_ratings')
        .select('subject_user_id, x_score, y_score')
        .eq('rater_user_id', raterUserId)

      if (error) {
        setError(error.message)
        setPlacements({})
        setIsLoadingRatings(false)
        return
      }

      const nextPlacements = ((data as RatingRow[] | null) ?? []).reduce<Record<string, Placement>>(
        (result, row) => {
          result[row.subject_user_id] = { x: Number(row.x_score), y: Number(row.y_score) }
          return result
        },
        {},
      )

      setPlacements(nextPlacements)
      setSelectedUserId(null)
      setIsLoadingRatings(false)
    }

    loadRatings()
  }, [raterUserId])

  useEffect(() => {
    function getNearbyPlacedUsers(clientX: number, clientY: number, rect: DOMRect) {
      return users
        .filter((user) => placements[user.id])
        .map((user) => {
          const placement = placements[user.id]
          const pointX = rect.left + ((placement.x + 100) / 200) * rect.width
          const pointY = rect.top + ((100 - placement.y) / 200) * rect.height
          return { userId: user.id, distance: Math.hypot(clientX - pointX, clientY - pointY) }
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
      if (!draggingUserId) return

      const coordinates = chartRef.current
        ? getChartCoordinates(
            event.clientX,
            event.clientY,
            chartRef.current.getBoundingClientRect(),
          )
        : { x: null, y: null }

      setDragPreview({
        clientX: event.clientX,
        clientY: event.clientY,
        ...coordinates,
      })
    }

    async function handlePointerUp(event: PointerEvent) {
      if (!draggingUserId || !chartRef.current) {
        finishDrag()
        return
      }

      const rect = chartRef.current.getBoundingClientRect()
      const start = dragStartRef.current
      const movedDistance = start
        ? Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY)
        : 0

      const wasTap = dragOriginRef.current === 'chart' && movedDistance <= TAP_DISTANCE_PX

      if (wasTap) {
        const nearbyUserIds = getNearbyPlacedUsers(event.clientX, event.clientY, rect)
        if (nearbyUserIds.length > 1) {
          setOverlapMenu({ clientX: event.clientX, clientY: event.clientY, userIds: nearbyUserIds })
        } else {
          setSelectedUserId(nearbyUserIds[0] ?? draggingUserId)
          setOverlapMenu(null)
        }
        finishDrag()
        return
      }

      const { x, y } = getChartCoordinates(
        event.clientX,
        event.clientY,
        rect,
      )

      if (x !== null && y !== null) {
        setPlacements((current) => ({ ...current, [draggingUserId]: { x, y } }))
        setSelectedUserId(draggingUserId)
        setOverlapMenu(null)

        if (raterUserId) {
          setSaveState('saving')
          const { error } = await supabase.from('seiso_ratings').upsert(
            {
              rater_user_id: raterUserId,
              subject_user_id: draggingUserId,
              x_score: x,
              y_score: y,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'rater_user_id,subject_user_id' },
          )

          if (error) {
            setError(error.message)
            setSaveState('error')
          } else {
            setSaveState('saved')
            window.setTimeout(() => setSaveState('idle'), 1200)
          }
        }
      }

      finishDrag()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingUserId, placements, users, raterUserId])

  useEffect(() => {
    function handleAvatarPointerMove(event: PointerEvent) {
      const start = avatarDragStartRef.current
      if (!start || !avatarImageSize) return

      const nextX = start.x + (event.clientX - start.clientX)
      const nextY = start.y + (event.clientY - start.clientY)
      setAvatarOffset(clampAvatarOffset(nextX, nextY, avatarZoom, avatarImageSize))
    }

    function handleAvatarPointerUp() {
      avatarDragStartRef.current = null
    }

    window.addEventListener('pointermove', handleAvatarPointerMove)
    window.addEventListener('pointerup', handleAvatarPointerUp)
    return () => {
      window.removeEventListener('pointermove', handleAvatarPointerMove)
      window.removeEventListener('pointerup', handleAvatarPointerUp)
    }
  }, [avatarZoom, avatarImageSize])

  const unplacedUsers = users.filter((user) => !placements[user.id])
  const selectedUser = users.find((user) => user.id === selectedUserId)
  const selectedPlacement = selectedUserId ? placements[selectedUserId] : undefined

  function clampAvatarOffset(x: number, y: number, zoom: number, imageSize: ImageSize) {
    const baseScale = Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height)
    const displayWidth = imageSize.width * baseScale * zoom
    const displayHeight = imageSize.height * baseScale * zoom
    const maxX = Math.max(0, (displayWidth - CROP_SIZE) / 2)
    const maxY = Math.max(0, (displayHeight - CROP_SIZE) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }

  function handleRaterChange(nextRaterUserId: string) {
    if (!nextRaterUserId) {
      setRaterUserId(null)
      localStorage.removeItem(LAST_RATER_STORAGE_KEY)
      return
    }
    setRaterUserId(nextRaterUserId)
    localStorage.setItem(LAST_RATER_STORAGE_KEY, nextRaterUserId)
  }

  function startDrag(event: React.PointerEvent, userId: string, origin: DragOrigin) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedUserId(userId)
    setDraggingUserId(userId)
    setOverlapMenu(null)
    const coordinates = chartRef.current
      ? getChartCoordinates(
          event.clientX,
          event.clientY,
          chartRef.current.getBoundingClientRect(),
        )
      : { x: null, y: null }

    const startPoint = {
      clientX: event.clientX,
      clientY: event.clientY,
      ...coordinates,
    }
    dragStartRef.current = startPoint
    dragOriginRef.current = origin
    setDragPreview(startPoint)
  }

  async function removeSelectedPlacement() {
    if (!selectedUserId || !placements[selectedUserId]) return

    const subjectUserId = selectedUserId
    setPlacements((current) => {
      const next = { ...current }
      delete next[subjectUserId]
      return next
    })
    setSelectedUserId(null)
    setOverlapMenu(null)

    if (!raterUserId) return
    setSaveState('saving')
    const { error } = await supabase
      .from('seiso_ratings')
      .delete()
      .eq('rater_user_id', raterUserId)
      .eq('subject_user_id', subjectUserId)

    if (error) {
      setError(error.message)
      setSaveState('error')
      return
    }
    setSaveState('saved')
    window.setTimeout(() => setSaveState('idle'), 1200)
  }

  function clearLocalAvatar() {
    if (avatarSourceUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarSourceUrl)
    setAvatarSourceUrl(null)
    setAvatarImageSize(null)
    setAvatarZoom(1)
    setAvatarOffset({ x: 0, y: 0 })
  }

  function openAddProfile() {
    clearLocalAvatar()
    setProfileMode('add')
    setProfileName('')
    setProfileTimezone(getBrowserTimezone())
    setProfileColor('#3b82f6')
    setProfileError(null)
    setRemoveAvatar(false)
  }

  function openEditProfile() {
    if (!raterUser) return
    clearLocalAvatar()
    setProfileMode('edit')
    setProfileName(raterUser.username)
    setProfileTimezone(raterUser.timezone)
    setProfileColor(raterUser.color ?? '#3b82f6')
    setProfileError(null)
    setRemoveAvatar(false)
  }

  function closeProfileModal() {
    clearLocalAvatar()
    setProfileMode(null)
    setProfileError(null)
    setRemoveAvatar(false)
  }

  function handleAvatarFile(file: File | null) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileError('Please choose a JPG, PNG or WebP image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setProfileError('Please choose an image under 10 MB.')
      return
    }

    clearLocalAvatar()
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setAvatarSourceUrl(url)
      setAvatarImageSize({ width: image.naturalWidth, height: image.naturalHeight })
      setAvatarZoom(1)
      setAvatarOffset({ x: 0, y: 0 })
      setRemoveAvatar(false)
      setProfileError(null)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      setProfileError('That image could not be opened.')
    }
    image.src = url
  }

  async function createAvatarBlob() {
    if (!avatarSourceUrl || !avatarImageSize) return null

    const image = new Image()
    image.src = avatarSourceUrl
    await image.decode()

    const baseScale = Math.max(CROP_SIZE / avatarImageSize.width, CROP_SIZE / avatarImageSize.height)
    const finalScale = baseScale * avatarZoom
    const sourceSize = CROP_SIZE / finalScale
    const sourceX = avatarImageSize.width / 2 - sourceSize / 2 - avatarOffset.x / finalScale
    const sourceY = avatarImageSize.height / 2 - sourceSize / 2 - avatarOffset.y / finalScale

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare avatar image.')

    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 128, 128)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process avatar image.'))),
        'image/webp',
        0.82,
      )
    })
  }

  async function uploadAvatar(userId: string, blob: Blob) {
    const path = `${userId}.webp`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '3600',
    })
    if (error) throw new Error(error.message)
    return path
  }

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault()
    const username = profileName.trim()
    const timezone = profileTimezone.trim()

    if (!username) {
      setProfileError('Please enter a name.')
      return
    }
    if (!timezone || !isValidTimezone(timezone)) {
      setProfileError('Please enter a valid timezone, such as Australia/Sydney.')
      return
    }

    setProfileSaving(true)
    setProfileError(null)

    try {
      const avatarBlob = await createAvatarBlob()

      if (profileMode === 'add') {
        const newUserId = crypto.randomUUID()
        let avatarPath: string | null = null

        if (avatarBlob) avatarPath = await uploadAvatar(newUserId, avatarBlob)

        const { data, error } = await supabase
          .from('users')
          .insert({
            id: newUserId,
            username,
            timezone,
            color: profileColor,
            avatar_path: avatarPath,
          })
          .select('id, username, timezone, color, avatar_path')
          .single()

        if (error) {
          if (avatarPath) await supabase.storage.from('avatars').remove([avatarPath])
          if (error.code === '23505') throw new Error('That name already exists.')
          throw new Error(error.message)
        }

        const newUser = data as User
        setUsers((current) => [...current, newUser].sort((a, b) => a.username.localeCompare(b.username)))
        setRaterUserId(newUser.id)
        localStorage.setItem(LAST_RATER_STORAGE_KEY, newUser.id)
      }

      if (profileMode === 'edit' && editingUser) {
        let avatarPath = editingUser.avatar_path

        if (removeAvatar && avatarPath) {
          const { error } = await supabase.storage.from('avatars').remove([avatarPath])
          if (error) throw new Error(error.message)
          avatarPath = null
        }

        if (avatarBlob) avatarPath = await uploadAvatar(editingUser.id, avatarBlob)

        const { data, error } = await supabase
          .from('users')
          .update({ username, timezone, color: profileColor, avatar_path: avatarPath })
          .eq('id', editingUser.id)
          .select('id, username, timezone, color, avatar_path')
          .single()

        if (error) {
          if (error.code === '23505') throw new Error('That name already exists.')
          throw new Error(error.message)
        }

        const updatedUser = data as User
        setUsers((current) =>
          current
            .map((user) => (user.id === updatedUser.id ? updatedUser : user))
            .sort((a, b) => a.username.localeCompare(b.username)),
        )
      }

      closeProfileModal()
    } catch (caughtError) {
      setProfileError(caughtError instanceof Error ? caughtError.message : 'Could not save profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  function avatarContents(user: User, className = 'avatar-image') {
    const avatarUrl = getAvatarUrl(user.avatar_path)
    if (avatarUrl) return <img className={className} src={avatarUrl} alt="" draggable={false} />
    return user.username.slice(0, 1).toUpperCase()
  }

  function plottedAvatar(
    user: User,
    extraClassName = '',
    showPlotPoint = false,
  ) {
    return (
      <div
        className={extraClassName ? `placed-avatar ${extraClassName}` : 'placed-avatar'}
        style={{ backgroundColor: user.color ?? undefined }}
      >
        <span className="placed-avatar-content">
          {avatarContents(user)}
        </span>
        {showPlotPoint && (
          <span className="plot-point-dot" aria-hidden="true" />
        )}
      </div>
    )
  }

  const cropBaseScale = avatarImageSize
    ? Math.max(CROP_SIZE / avatarImageSize.width, CROP_SIZE / avatarImageSize.height)
    : 1

  return (
    <main className="app">
      <header className="header">
        <div className="header-title-row">
          <div>
            <p className="eyebrow">Ayano/Hana/Toshi Server Collaboration</p>
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
      </header>

      <nav className="tabs" aria-label="Seiso Index views">
        <button className={activeTab === 'chart' ? 'tab active' : 'tab'} onClick={() => setActiveTab('chart')}>
          My Chart
        </button>
        <button className={activeTab === 'analysis' ? 'tab active' : 'tab'} onClick={() => setActiveTab('analysis')}>
          Analysis
        </button>
      </nav>

      {error && <div className="error">{error}</div>}

      {activeTab === 'chart' && (
        <>
          <section className="identity-section">
            <div className="identity-row">
              <label className="identity-label" htmlFor="rater-select">Name:</label>
              <select
                id="rater-select"
                className="user-select"
                value={raterUserId ?? ''}
                onChange={(event) => handleRaterChange(event.target.value)}
              >
                <option value="">Select name</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
              </select>

              <button
                type="button"
                className="edit-profile-button"
                onClick={openEditProfile}
                disabled={!raterUser}
                aria-label="Edit profile"
                title="Edit profile"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm16.7-10.6a1 1 0 0 0 0-1.4l-1.2-1.2a1 1 0 0 0-1.4 0l-1.4 1.4 3.5 3.5 1.5-1.3Z" />
                </svg>
              </button>

              <button type="button" className="text-button" onClick={openAddProfile}>+ Add myself</button>

              <span className="save-status" aria-live="polite">
                {isLoadingRatings && 'Loading…'}
                {!isLoadingRatings && saveState === 'saving' && 'Saving…'}
                {!isLoadingRatings && saveState === 'saved' && 'Saved'}
                {!isLoadingRatings && saveState === 'error' && 'Save failed'}
              </span>
            </div>
          </section>

          {!raterUserId ? (
            <section className="rater-empty-state">Choose your name to load your chart.</section>
          ) : (
            <>
              <section className="user-strip">
                {unplacedUsers.length > 0 ? (
                  unplacedUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={selectedUserId === user.id ? 'user-card selected' : 'user-card'}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <div
                        className="avatar-placeholder"
                        style={{ backgroundColor: user.color ?? undefined }}
                        onPointerDown={(event) => startDrag(event, user.id, 'strip')}
                      >
                        {avatarContents(user)}
                      </div>
                      <span>{user.username}</span>
                    </button>
                  ))
                ) : (
                  <p className="user-strip-empty">Everyone has been placed.</p>
                )}
              </section>

              <section className="chart-wrapper">
                <div className="chart-label top">Is Seiso</div>
                <div className="chart-label left">Acts Yabai</div>
                <div className="chart-label right">Acts Seiso</div>
                <div className="chart-label bottom">Is Yabai</div>

                <div
                  ref={chartRef}
                  className={draggingUserId ? 'alignment-chart alignment-chart--dragging' : 'alignment-chart'}
                  onPointerDown={() => setOverlapMenu(null)}
                >
                  <div className="axis vertical" />
                  <div className="axis horizontal" />

                  {users.map((user) => {
                    const placement = placements[user.id]
                    if (!placement) return null
                    const isSelected = selectedUserId === user.id

                    const isDragging = draggingUserId === user.id

                    return (
                      <button
                        key={user.id}
                        type="button"
                        className={[
                          'placed-user',
                          isSelected ? 'placed-user--selected' : '',
                          isDragging ? 'placed-user--dragging' : '',
                        ].filter(Boolean).join(' ')}
                        style={{
                          left: `${(placement.x + 100) / 2}%`,
                          top: `${(100 - placement.y) / 2}%`,
                        }}
                        onPointerDown={(event) => startDrag(event, user.id, 'chart')}
                        title={`${user.username}: ${placement.x.toFixed(0)}, ${placement.y.toFixed(0)}`}
                      >
                        {plottedAvatar(user)}
                        <span>{user.username}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              {selectedUser && selectedPlacement && (
                <div className="placement-actions">
                  <span>Selected: <strong>{selectedUser.username}</strong></span>
                  <button type="button" className="remove-placement-button" onClick={removeSelectedPlacement}>
                    Remove placement
                  </button>
                </div>
              )}
            </>
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
        const user = users.find((candidate) => candidate.id === draggingUserId)
        if (!user) return null
        return (
          <div className="drag-preview drag-preview--active" style={{ left: dragPreview.clientX, top: dragPreview.clientY }}>
            {plottedAvatar(user, 'placed-avatar--dragging', true)}
            <span>{user.username}</span>
            {dragPreview.x !== null && dragPreview.y !== null && (
              <div className="drag-coordinate-tooltip" role="status" aria-live="polite">
                {dragPreview.x}, {dragPreview.y}
              </div>
            )}
          </div>
        )
      })()}

      {overlapMenu && (
        <div className="overlap-menu" style={{ left: overlapMenu.clientX, top: overlapMenu.clientY }}>
          <p>People here</p>
          {overlapMenu.userIds.map((userId) => {
            const user = users.find((candidate) => candidate.id === userId)
            if (!user) return null
            return (
              <button key={user.id} type="button" onClick={() => { setSelectedUserId(user.id); setOverlapMenu(null) }}>
                <span className="overlap-avatar" style={{ backgroundColor: user.color ?? undefined }}>
                  {avatarContents(user)}
                </span>
                {user.username}
              </button>
            )
          })}
        </div>
      )}

      {profileMode && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !profileSaving) closeProfileModal()
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
            <div className="modal-header">
              <div>
                <h2 id="profile-modal-title">{profileMode === 'add' ? 'Add myself' : 'Edit profile'}</h2>
                <p>{profileMode === 'add' ? 'Create a simple profile.' : 'Update your profile.'}</p>
              </div>
              <button type="button" className="modal-close" onClick={closeProfileModal} disabled={profileSaving} aria-label="Close">×</button>
            </div>

            <form className="modal-form" onSubmit={handleProfileSubmit}>
              <label>
                Name
                <input type="text" maxLength={40} value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Your name" autoComplete="off" required />
              </label>

              <label>
                Timezone
                <input type="text" value={profileTimezone} onChange={(event) => setProfileTimezone(event.target.value)} placeholder="Australia/Sydney" required />
              </label>
              <p className="form-hint">Detected from your device.</p>

              <label>
                Your colour
                <div className="color-picker-row">
                  <input type="color" className="color-picker" value={profileColor} onChange={(event) => setProfileColor(event.target.value)} />
                  <span>{profileColor}</span>
                </div>
              </label>

              <div className="avatar-field">
                <span className="field-label">Profile picture <small>Optional</small></span>

                {profileMode === 'edit' && editingUser?.avatar_path && !avatarSourceUrl && !removeAvatar && (
                  <div className="existing-avatar-row">
                    <img src={getAvatarUrl(editingUser.avatar_path) ?? ''} alt="Current profile" className="existing-avatar-preview" />
                    <button type="button" className="text-button avatar-remove-button" onClick={() => setRemoveAvatar(true)}>Remove picture</button>
                  </div>
                )}

                {profileMode === 'edit' && editingUser?.avatar_path && removeAvatar && !avatarSourceUrl && (
                  <p className="form-hint avatar-removed-note">Current picture will be removed when you save.</p>
                )}

                <label className="avatar-upload-button">
                  {avatarSourceUrl ? 'Choose a different picture' : editingUser?.avatar_path && !removeAvatar ? 'Replace picture' : 'Choose picture'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleAvatarFile(event.target.files?.[0] ?? null)} />
                </label>

                {avatarSourceUrl && avatarImageSize && (
                  <>
                    <div
                      className="avatar-cropper"
                      onPointerDown={(event) => {
                        event.preventDefault()
                        avatarDragStartRef.current = {
                          clientX: event.clientX,
                          clientY: event.clientY,
                          x: avatarOffset.x,
                          y: avatarOffset.y,
                        }
                      }}
                    >
                      <img
                        src={avatarSourceUrl}
                        alt="Avatar crop preview"
                        draggable={false}
                        style={{
                          width: `${avatarImageSize.width * cropBaseScale}px`,
                          height: `${avatarImageSize.height * cropBaseScale}px`,
                          transform: `translate(calc(-50% + ${avatarOffset.x}px), calc(-50% + ${avatarOffset.y}px)) scale(${avatarZoom})`,
                        }}
                      />
                      <div className="avatar-crop-ring" />
                    </div>

                    <label className="zoom-control">
                      Zoom
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.05"
                        value={avatarZoom}
                        onChange={(event) => {
                          const nextZoom = Number(event.target.value)
                          setAvatarZoom(nextZoom)
                          setAvatarOffset((current) => clampAvatarOffset(current.x, current.y, nextZoom, avatarImageSize))
                        }}
                      />
                    </label>
                    <p className="form-hint">Drag to position.</p>
                  </>
                )}
              </div>

              <div className="form-message">{profileError}</div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeProfileModal} disabled={profileSaving}>Cancel</button>
                <button type="submit" className="primary-button" disabled={profileSaving}>
                  {profileSaving ? 'Saving...' : profileMode === 'add' ? 'Create profile' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isInfoOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={() => setIsInfoOpen(false)}>
          <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="info-modal-header">
              <div><p className="eyebrow">Seiso Index</p><h2 id="info-modal-title">How to use it</h2></div>
              <button type="button" className="modal-close" aria-label="Close information" onClick={() => setIsInfoOpen(false)}>×</button>
            </div>
            <div className="info-modal-content">
              <p>Drag each person from the row at the top onto the chart. Once placed, they disappear from that row.</p>
              <div className="info-axis-grid">
                <div><strong>Top</strong><span>Is Seiso</span></div>
                <div><strong>Bottom</strong><span>Is Yabai</span></div>
                <div><strong>Left</strong><span>Acts Yabai</span></div>
                <div><strong>Right</strong><span>Acts Seiso</span></div>
              </div>
              <p>To change someone&apos;s rating, drag their avatar directly on the chart. The currently selected person is outlined in blue.</p>
              <p>If several people are on top of each other, tap the group and choose the person you want from the <strong>People here</strong> menu.</p>
              <p>Use <strong>Remove placement</strong> to return the selected person to the unplaced row.</p>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
