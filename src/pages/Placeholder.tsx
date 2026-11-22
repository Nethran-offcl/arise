import { SystemWindow } from '../components/SystemWindow';

export default function Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <SystemWindow title={title}>
      <p className="text-muted">[SYSTEM] This module unlocks in Phase {phase}.</p>
    </SystemWindow>
  );
}
