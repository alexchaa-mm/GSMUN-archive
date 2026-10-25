// The isolated React harness has no Next router. API/navigation route guards
// are tested separately; ordinary admin links still render as real anchors.
export default function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} />; }
