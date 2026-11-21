import { Router } from 'express';
import {
  createStore,
  deleteStore,
  getStoreById,
  getStores,
  setDefaultStore,
  updateStore,
} from '../controllers/store.controller';

const router = Router();

router.get('/', getStores);
router.get('/:id', getStoreById);
router.post('/', createStore);
router.put('/:id', updateStore);
router.patch('/:id/set-default', setDefaultStore);
router.delete('/:id', deleteStore);

export default router;
