const serverUrl = import.meta.env.VITE_SERVER_URL;

export const fetchData = async () => {
  const response = await fetch(`${serverUrl}/api/data`);
  const data = await response.json();
  return data;
};
