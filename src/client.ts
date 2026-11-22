export class ApiError extends Error {
  constructor(message:string, public code?:string) {super(message)}
}

export async function responseData(response:Response) {
  const data=await response.json().catch(()=>null)
  if(!response.ok) throw new ApiError(data?.message??'無法連線至 BARKEEP，請稍後重試。',data?.code)
  return data
}
