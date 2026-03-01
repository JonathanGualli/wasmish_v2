import React, { useEffect, useState } from "react"
import { CustomInput } from "../../../components/Input/Input"
import { CustomButton } from "../../../components/Button/Button";
import { AppRoutes } from "../../../models/routes.models";
import { Link, useNavigate } from "react-router-dom";
import { useAuthContext } from "../../../context/auth.context";
import { useModalContext } from "../../../components/Modal/context/UseModalContext";
import { useSignUp } from "../../../hooks/useSignUp";
import type { AxiosError } from "axios";

interface ErrorItem {
  message: string;
}

export const SignUpPage = () => {

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const { isLoading, errors, isAuthenticated, signUp } = useAuthContext();

  const { setState, setContent } = useModalContext();

  const signUpMutation = useSignUp();
  const navigate = useNavigate();


  const handleSignUp = (event: React.FormEvent)   => {
    event.preventDefault();

    signUp(name, email, password);

  }

  useEffect(() => {
    if(isAuthenticated){
       navigate(`${AppRoutes.private.root}/${AppRoutes.private.quickStart}`);
    }
  }, [isAuthenticated, navigate]);

  //Detectar Errores
  useEffect(() => {
      if(errors.length > 0) {
          setContent( 
          <div className="text-red-500">
              {errors.map((err, i) => (
              <p key={i}>{err}</p>
              ))}
          </div>)
          setState(true);
      }
  }, [errors, setContent, setState]);

  //Detectar Errores
  useEffect(() => {
      if(signUpMutation.isError) {
          setContent( 
          <div className="text-red-500">
              {(signUpMutation.error as AxiosError<ErrorItem[]>).response?.data.map((err, i) => (
                  <p key={i}>{err.message}</p>
              )) || <p>A ocurrido un error, intentalo de nuevo más tarde</p>}
          </div>)
          setState(true);
      }
  }, [signUpMutation, setContent, setState]);

  return (
    <div className="w-screen h-screen bg-gradient-to-r from-purple-200 to-cyan-100 flex justify-center items-center">
      <div className="flex flex-row max-w-11/12 max-h-11/12 w-6xl rounded-2xl overflow-hidden">
        
        <div className="bg-white basis-2/5 p-10 flex justify-center flex-col">
          <h1 className="text-center font-extrabold pb-15 mt-10">Regístrate en Wasmish</h1>

          <form onSubmit={handleSignUp} className="flex flex-col">
            <CustomInput 
                label='Nombre completo'
                required={true}
                type='text' 
                placeholder='Jonathan Gualli'
                value={name}
                onChange={(e) => setName(e.target.value)}
            />

            <CustomInput 
                label='Correo electrónico'
                required={true}
                type='email' 
                placeholder='email@ejemplo.com'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />

            <CustomInput 
                label='Contraseña'
                required={true}
                type='password' 
                placeholder='********'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <br />

            <CustomButton type='submit'>
              {isLoading ? <p className="font-bold">Cargando</p> : <p className="font-bold">Registrarme</p>}
            </CustomButton>

            <hr className='border-t border-gray-300 pb-5'/>

            <p className='text-gray-400 text-sm text-center'>¿Ya tienes cuenta? <Link to={AppRoutes.login} className='text-green-500 font-bold'>Inicia sesión</Link></p> 
                        
          </form>

        </div>

        <div className="basis-3/5">
          <img src="https://images7.alphacoders.com/747/thumb-1920-747498.jpg" className="object-cover w-full h-full"/>
        </div>

      </div>
    </div>
  )
}
