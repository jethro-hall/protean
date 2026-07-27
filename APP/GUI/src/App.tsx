import { AppStateProvider } from './state/AppStateProvider';
import { Layout } from './shell/Layout';

export default function App() {
  return (
    <AppStateProvider>
      <Layout />
    </AppStateProvider>
  );
}
