import { AppStateProvider } from './state/store';
import { Layout } from './shell/Layout';

export default function App() {
  return (
    <AppStateProvider>
      <Layout />
    </AppStateProvider>
  );
}
