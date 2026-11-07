import { useId, useMemo } from 'react'
import { truckSvg, type TruckPaint } from './peterbilt'
export { paintFor } from './paint'

export default function Truck({ paint, scene, className, shadow }: { paint: TruckPaint; scene?: { bg: string; ground: string; line?: string }; className?: string; shadow?: boolean }) {
  const id = useId()
  const html = useMemo(() => truckSvg(paint, { id: 't' + id, scene, shadow }), [paint, scene, id, shadow])
  return <div className={`[&>svg]:block [&>svg]:w-full [&>svg]:h-auto ${className ?? ''}`} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
}
