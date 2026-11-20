import ActionBar from "./components/ActionBar";
import ClusterBar from "./components/ClusterBar";
import GameLog from "./components/GameLog";
import JoinForm from "./components/JoinForm";
import ResultPanel from "./components/ResultPanel";
import Table from "./components/Table";
import { Loading, PageHeader } from "./components/ui";
import { useNow, useTable } from "./useTable";

export default function App() {
  const { view, cluster, status, error, send, clockOffset } = useTable();
  const now = useNow() + clockOffset; // horário do servidor, para os cronômetros

  return (
    <div className="mx-auto max-w-7xl px-4 pt-3 pb-8">
      <PageHeader
        title="Poker Distribuído"
        link={
          <a href="/dashboard" target="_blank" rel="noreferrer">
            Painel do cluster ↗
          </a>
        }
      >
        <ClusterBar cluster={cluster} status={status} />
      </PageHeader>

      {error && (
        <div className="fixed top-4 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-danger bg-[#5a1f1f] px-5 py-2.5">
          {error}
        </div>
      )}

      {!view ? (
        <Loading>Conectando ao cluster…</Loading>
      ) : (
        <main className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-[1fr_320px]">
          <section>
            <Table view={view} now={now} />
            {view.me ? (
              <ActionBar view={view} send={send} />
            ) : (
              <JoinForm onJoin={(name) => send({ type: "join", name })} />
            )}
          </section>
          <aside>
            <ResultPanel result={view.lastResult} nextHandAt={view.nextHandAt} now={now} />
            <GameLog log={view.log} />
          </aside>
        </main>
      )}
    </div>
  );
}
