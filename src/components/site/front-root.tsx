'use client'

import { SitePreview } from '@/components/site/preview-shell'

/** 公开前台（前后端分离）：全屏渲染小说站点，蜘蛛/读者可直接访问，无任何后台元素 */
export function FrontRoot() {
  return (
    <div className="h-dvh w-full overflow-hidden" data-testid="public-front">
      <SitePreview embedded />
    </div>
  )
}
