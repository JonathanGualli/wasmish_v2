interface InputProps {
    label?: string, 
    required?: boolean,
    type?: 'text' | 'email' | 'password' | 'number' | 'date',
    placeholder?: string, 
    value?: string, 
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void,
}

export const CustomInput: React.FC<InputProps> = ({
    label, 
    required = false,
    type = 'text', 
    placeholder = '', 
    value, onChange,
}) => {
    return (
        <div className={`w-full`}>
            {label && 
            <label className="flex flex-row items-center gap-1 pb-1 text-sm font-medium text-gray-900">
                {label} { required && <span className="text-red-500">*</span>}
            </label>
            }
            <input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                className='border border-gray-300 rounded-md p-2 w-full h-10' 
            />
            
        </div>
    );
}