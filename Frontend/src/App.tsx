import type { ReactNode } from 'react';
import './App.css'
import { Notice } from './components/Notice/Notice';

interface Props {
  children: ReactNode;
}

function App({children}: Props) {

  return (
    <>
      <Notice></Notice>
      {children}
    </>
  )
}

export default App