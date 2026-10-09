import type { LanguageCode } from '../i18n'

export type AnnouncementLanguageContent = {
  title: string
  heading: string
  paragraphs?: string[]
  bullets?: string[]
  footer?: string
  dismissLabel: string
}

export type CurrentAnnouncement = {
  /*
    Change this ID ONLY when you want every browser/device to see
    a new announcement once.

    Micro-pushes can leave this unchanged and nobody gets another popup.
  */
  id: string

  /*
    Set to false if you want to temporarily disable the popup without
    deleting the announcement content.
  */
  enabled: boolean

  /*
    Language content is keyed by LanguageCode rather than fixed `en` / `ja`
    fields. Adding another supported language later only requires adding its
    locale entry and announcement content, without changing the modal model.
  */
  content: Partial<Record<LanguageCode, AnnouncementLanguageContent>>
}

/*
  ============================================================
  EDIT THIS FILE WHEN YOU WANT TO ANNOUNCE SOMETHING NEW
  ============================================================

  Typical workflow:

  1. Change `id` to a new unique/readable value.
  2. Update the content below.
  3. Push to production.

  Each browser/device will see ONLY this current announcement,
  and only once for this ID.
*/
export const currentAnnouncement: CurrentAnnouncement = {
  id: 'seiso-chart-profile-update',
  enabled: true,

  content: {
    en: {
      title: "What's New",
      heading: 'Seiso Index update ✨',
      bullets: [
        'New Seiso alignment chart',
        'You can now edit your profile',
        'Add a custom profile picture',
      ],
      dismissLabel: 'OK',
    },

    ja: {
      title: '新しいお知らせ',
      heading: 'Seiso Indexをアップデートしました ✨',
      bullets: [
        '新しいSeisoアラインメントチャート',
        'プロフィールを編集できるようになりました',
        '好きなプロフィール画像を追加できます',
      ],
      dismissLabel: 'OK',
    },
  },
}

export function getAnnouncementContent(language: LanguageCode) {
  return currentAnnouncement.content[language] ?? currentAnnouncement.content.en
}
