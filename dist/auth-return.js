/** Completa el enlace sin registrar ni mostrar tokens. Inyectable para pruebas sin correos reales. */
export async function completeConfirmation({url,connect,storage,clearUrl}) {
  try { storage.setItem('alerta-rd-mode','real'); } catch {}
  const query = new URL(url).searchParams;
  const fragment = new URLSearchParams(new URL(url).hash.slice(1));
  try {
    if(query.has('error') || fragment.has('error')) {
      return {ok:false,message:'El enlace venció o ya fue utilizado. Si ya confirmaste tu correo, inicia sesión. Si sigue pendiente, solicita otro enlace desde «Reenviar confirmación».'};
    }
    const cloud = connect();
    if(!cloud) return {ok:false,message:'No se pudo conectar con Supabase. Vuelve a la aplicación e inténtalo de nuevo.'};
    const session = await cloud.session();
    if(session) return {ok:true,message:'Correo confirmado. Abriendo tus contactos…'};
    return {ok:false,message:'No hay una sesión activa en este enlace. Si tu correo ya está confirmado, inicia sesión con tu correo y contraseña. Si no, solicita una nueva confirmación.'};
  } catch {
    return {ok:false,message:'No se pudo completar la confirmación. Revisa tu conexión e inicia sesión. Puedes solicitar un nuevo enlace si tu correo sigue pendiente.'};
  } finally { clearUrl(); }
}
