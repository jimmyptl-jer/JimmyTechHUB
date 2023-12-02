import Product from "../models/product.js";

// Get all products using static method
export const getAllProductsStatic = async (req, res) => {

  const { rating } = req.query

  try {
    const Products = await Product.find({ price: { $gt: 20 } }).select('name price')
    res.status(200).json(Products)
  } catch (error) {
    console.error('Error getting all products:', error);
    res.status(500).send('Internal Server Error');
  }
}




// Get all products using instance method
export const getAllProducts = async (req, res) => {
  try {
    // Destructure query parameters from the request
    const { featured, company, name, sort, fields, numericFilters } = req.query;

    // Initialize an empty query object for MongoDB
    const queryObject = {};

    // Apply filters based on query parameters
    if (featured) {
      queryObject.featured = featured === 'true' ? true : false;
    }

    if (company) {
      queryObject.company = company;
    }

    if (name) {
      // Use regular expression for case-insensitive partial matching on product names
      queryObject.name = { $regex: name, $options: 'i' };
    }

    if (numericFilters) {
      // Map operators for numeric filters
      const operatorMap = {
        '<': '$lt',
        '>': '$gt',
        '=': '$eq',
        '<=': '$lte',
        '>=': '$gte'
      };

      // Convert numeric filters to MongoDB operators
      const regEx = /\b(<|>|>=|=|<|<=)\b/g;
      const filters = numericFilters.replace(
        regEx,
        (match) => `-${operatorMap[match]}-`
      );

      // Split and process numeric filters for specified fields
      const options = ['price', 'rating'];
      filters.split(',').forEach((item) => {
        const [field, operator, value] = item.split('-');
        if (options.includes(field)) {
          queryObject[field] = { [operator]: Number(value) };
        }
      });
    }

    // Query MongoDB with the constructed filter
    let result = await Product.find(queryObject);

    // Apply sorting if specified
    if (sort) {
      const sortList = sort.split(',').join(' ');
      result = result.sort(sortList);
    } else {
      // Default sorting by creation date if not specified
      result = result.sort('createdAt');
    }

    // Select specific fields if specified
    if (fields) {
      const fieldList = fields.split(',').join(' ');
      result = result.select(fieldList);
    }

    // Pagination setup
    const page = Number(req.body.page) || 1;
    const limit = Number(req.body.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch products for the specified page and limit
    const products = await result.skip(skip).limit(limit);

    // Respond with the fetched products
    res.status(200).json(products);
  } catch (error) {
    // Handle errors and send an internal server error response
    console.error('Error getting all products:', error);
    res.status(500).send('Internal Server Error');
  }
};


// // Create a new product
// export const createProduct = (req, res) => {
//   try {

//     res.send('Implement logic to create a new product');
//   } catch (error) {
//     console.error('Error creating product:', error);
//     res.status(500).send('Internal Server Error');
//   }
// }

// // Get a single product by ID
// export const getSingleProduct = (req, res) => {
//   try {
//     const { id } = req.params

//     const product = Product.findById(id)

//     if (!product) {
//       return res.status(404).send({ message: 'No product found with that id' })
//     }

//     res.status(200).json(product)
//   } catch (error) {
//     console.error('Error getting single product:', error);
//     res.status(500).send('Internal Server Error');
//   }
// }

// // Delete a product by ID
// export const deleteProduct = (req, res) => {
//   try {

//     const { id } = req.params
//     const product = Product.findByIdAndDelete(id)

//     if (!product) {
//       return res.status(404).send({ message: 'No product found with that id' })
//     }

//     res.status(200).json(product)

//   } catch (error) {
//     console.error('Error deleting product:', error);
//     res.status(500).send('Internal Server Error');
//   }
// }
