import type { ReactNode } from 'react';
import './App.css'
import { Modal } from './components/Modal/Modal';

interface Props {
  children: ReactNode;
}

function App({children}: Props) {

  return (
    <>
      <Modal></Modal>
      {children}
    </>
  )
}

export default App