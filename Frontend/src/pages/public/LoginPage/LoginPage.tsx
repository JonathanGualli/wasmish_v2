import React, { useEffect, useState } from 'react';
import { CustomButton } from '../../../components/Button/Button';
import { CustomInput } from '../../../components/Input/Input';
import { useAuthContext } from '../../../context/auth.context';
import { Link, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../../../models/routes.models';
import { useModalContext } from '../../../components/Modal/context/UseModalContext';
import bannerWasmish from '../../../assets/banner_wasmish.png';


export const LoginPage = () => {

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { signIn, errors, isAuthenticated, isLoading} = useAuthContext();

    const { setState, setContent } = useModalContext();

    const navigate = useNavigate();


    useEffect(() => {
        if(isAuthenticated){
            navigate(`${AppRoutes.private.root}/${AppRoutes.private.quickStart}`);
        }
    }, [isAuthenticated, navigate]);

    const handleLogin = (event: React.FormEvent) => {
        event.preventDefault();
        signIn(email, password);
    }

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
/*     useEffect(() => {
        if(loginMutation.isError) {
            setContent( 
            <div className="text-red-500">
                {(loginMutation.error as AxiosError<ErrorItem[]>).response?.data.map((err, i) => (
                    <p key={i}>{err.message}</p>
                )) || <p>A ocurrido un error, intentalo de nuevo más tarde</p>}
            </div>)
            setState(true);
        }
    }, [loginMutation, setContent, setState]); */


    return (
         <div className='w-screen h-screen bg-linear-to-r from-purple-200 to-cyan-100 flex justify-center items-center'>
            <div className='flex flex-row max-w-11/12 max-h-11/12 w-6xl rounded-2xl overflow-hidden'>
                
                <div className='basis-3/5'>
                    <img src={bannerWasmish} className='object-cover w-full h-full'/>
                </div>
                
                <div className='bg-white basis-2/5 p-10 flex justify-center flex-col'>
                    <h1 className='text-center font-extrabold mb-15 mt-10'>Bienvenido a Wasmish</h1>

                    <form onSubmit={handleLogin} className='flex flex-col'>

                        <div className='pb-4'>
                            <CustomInput 
                                label='Correo electrónico'
                                required={true}
                                type='email' 
                                placeholder='email@ejemplo.com'
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>                    
                        
                        <div className='pb-4'>
                            <CustomInput 
                                label='Contraseña'
                                required={true}
                                type='password' 
                                placeholder='********'
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        
                        <p className='text-center text-sm text-green-500 cursor-pointer mb-5 mt-10'>¿Olvidaste tu contraseña?</p>

                        <div className='h-12'>
                            <CustomButton type='submit' isLoading={isLoading}>
                                {isLoading ? <p className="font-bold">Cargando ...</p> : <p className="font-bold">Iniciar sesión</p>}
                            </CustomButton>
                        </div>
                        

                        <hr className='border-t border-gray-300 mb-5 mt-5'/>

                        <p className='text-gray-400 text-sm text-center'>¿No tienes cuenta? <Link to={AppRoutes.register} className='text-green-500 font-bold'>Regístrate Ahora</Link></p> 
                        
                    </form>
                </div>
            </div>        
        </div> 
    );
}