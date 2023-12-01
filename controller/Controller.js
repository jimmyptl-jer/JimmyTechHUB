import { asyncWrapper } from '../middleware/async.js';
import Task from '../models/Model.js'

export const getAllTask = asyncWrapper(
  async (req, res) => {
    const tasks = await Task.find()
    res.status(200).json(tasks)
  }
)

export const createTask = async (req, res) => {
  const { name, completed } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Task name must be provided' });
  }

  if (completed !== undefined && typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'Invalid value for completed field' });
  }

  try {
    const task = await Task.create({
      name,
      completed,
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create the task', details: error.message });
  }
};



export const getTask = async (req, res) => {
  try {
    const { id } = req.params

    const results = await Task.findById(id)

    if (!results) {
      return res.status(404).json({ message: 'No Task Found' });
    }

    return res.status(200).json(results)
  } catch (error) {
    console.error('Error finding task:', error);
    res.status(500).json({ error: 'Failed to find the task', details: error.message });
  }
}

export const updateTask = async (req, res) => {
  try {
    if (!req.body.name || !req.body.completed) {
      return res.status(400).json({
        message: "Invalid Data"
      })
    }

    const { id } = req.params
    const results = await Task.findByIdAndUpdate(id)

    if (!results) {
      return res.status(404).json({ message: 'No Task Found' });
    }

    return res.status(200).json(results)
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update the task', details: error.message });
  }
}

export const deleteTask = async (request, response) => {
  try {
    const { id } = request.params;

    // Use "await" to get the deleted program
    const results = await Task.findByIdAndDelete(id);

    // Check if the program was found and deleted
    if (!results) {
      return response.status(404).json({ message: 'No Task Found' });
    }

    // Respond with a 200 OK status and a success message
    return response.status(200).json({ message: 'Task Deleted Successfully' });

  } catch (error) {
    // Handle errors by sending a 500 Internal Server Error response
    console.log(error);
    response.status(500).send({ message: error.message });
  }
}
