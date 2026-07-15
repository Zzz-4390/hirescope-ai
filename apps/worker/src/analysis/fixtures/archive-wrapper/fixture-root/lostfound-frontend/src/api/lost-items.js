import axios from 'axios';

export const getLostItems = () => axios.get('/api/lost-items');
