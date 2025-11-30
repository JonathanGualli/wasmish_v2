import React, { type ReactNode } from 'react';
import './Button.css';

interface ButtonProps {
    children: ReactNode,
    type?: 'button' | 'submit' | 'reset',
    color?: string,
    onClick?: () => void,
    isLoading?: boolean,

}

export const CustomButton: React.FC<ButtonProps> = ({ 
    children, 
    color = 'var(--color-blue-500)', 
    onClick, 
    type='button', 
    isLoading = false,
    }) => {
    return (
        <div className='flex flex-col w-full h-full'>
            <button
                className={`
                    text-white 
                    rounded-md 
                    cursor-pointer 
                    transition-transform 
                    border 
                    border-transparent
                    h-full px-4 py-2
                    ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105'}`}
                style={{ backgroundColor: color}}
                onClick = { onClick }
                type={type}
                disabled={isLoading}
            >
                {isLoading ? (
                    <div className="flex items-center justify-center">
                        <span className="loader"></span>
                    </div>
                ) : (
                    <span className='truncate text-center justify-center flex overflow-hidden'>
                        {children}
                    </span>
                )}
            </button>
        </div>
        
    );
};