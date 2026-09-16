import { ErrorBoundary } from './ErrorBoundary'
import { ProjectShell } from './features/project-shell/ProjectShell'
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <ProjectShell />
    </ErrorBoundary>
  )
}

export default App
