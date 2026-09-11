export function NotYet({ stage }: { stage: string }) {
  return (
    <section className="panel">
      <h2>{stage}</h2>
      <p>Not yet. This stage is not built.</p>
    </section>
  )
}
