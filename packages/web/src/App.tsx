import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { queryClient } from './api/queries.ts';
import { Calibrate } from './pages/Calibrate/Calibrate.tsx';
import { Home } from './pages/Home/Home.tsx';
import { NewProject } from './pages/NewProject/NewProject.tsx';
import { ProjectPage } from './pages/Office/ProjectPage.tsx';
import { Placeholder } from './pages/Placeholder/Placeholder.tsx';
import { Shell } from './pages/Shell/Shell.tsx';
import { Settings } from './pages/Settings/Settings.tsx';
import { Welcome } from './pages/Welcome/Welcome.tsx';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/new', element: <NewProject /> },
      { path: '/p/:id/calibrate', element: <Calibrate /> },
      // V4 (o6): the project page for a project with an office, else the V3 workspace. One
      // route, so moving between /p/:id and its views never remounts the workspace.
      { path: '/p/:id/*', element: <ProjectPage /> },
      { path: '/settings/:section?', element: <Settings /> },
      { path: '/welcome', element: <Welcome /> },
      { path: '*', element: <Placeholder title="Not found" milestone="—" /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
