import ModalShell from './ModalShell'
import type { AnnouncementLanguageContent } from './announcements/currentAnnouncement'

type Props = {
  content: AnnouncementLanguageContent
  closeLabel: string
  onClose: () => void
}

export default function WhatsNewModal({ content, closeLabel, onClose }: Props) {
  return (
    <ModalShell
      titleId="whats-new-title"
      title={content.title}
      closeLabel={closeLabel}
      onClose={onClose}
    >
      <div className="whats-new-content">
        <h3>{content.heading}</h3>

        {content.paragraphs?.map((paragraph, index) => (
          <p key={`paragraph-${index}`}>{paragraph}</p>
        ))}

        {content.bullets && content.bullets.length > 0 && (
          <ul>
            {content.bullets.map((bullet, index) => (
              <li key={`bullet-${index}`}>{bullet}</li>
            ))}
          </ul>
        )}

        {content.footer && (
          <p className="whats-new-footer">{content.footer}</p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
          >
            {content.dismissLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
